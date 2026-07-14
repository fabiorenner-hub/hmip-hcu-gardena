'use strict';

/**
 * OTA loader — the IMAGE entrypoint. It decides whether to boot the built-in
 * (image) code or an OTA payload from /data/ota/active, with crash-loop
 * protection and rollback.
 *
 * HARD RULE: this file may only require Node built-ins (fs, path, crypto).
 * Never import app code or node_modules here — a broken OTA payload must not
 * be able to take the loader down with it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BOOT_ATTEMPTS = 3;

// --- inline semver (no app imports) ---------------------------------------

function parseCore(v) {
    const core = String(v || '').split('+')[0];
    const m = core.match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function cmpCore(a, b) {
    const pa = parseCore(a);
    const pb = parseCore(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
}

function payloadNewerThanCore(payloadVer, coreVer) {
    const c = cmpCore(payloadVer, coreVer);
    if (c !== 0) return c > 0;
    const pBuild = String(payloadVer).includes('+');
    const cBuild = String(coreVer).includes('+');
    if (pBuild && !cBuild) return true;
    if (pBuild && cBuild) return String(payloadVer) > String(coreVer);
    return false;
}

// --- pure decision --------------------------------------------------------

function decideBundle({ hasActiveMain, manifest, mainSha256Ok, coreVersion, bootAttempts }) {
    if (!hasActiveMain) return { bundle: 'image', reason: 'no-bundle', quarantine: false };
    if (!manifest || !manifest.version || !manifest.minCoreVersion) {
        return { bundle: 'image', reason: 'bad-manifest', quarantine: true };
    }
    if (mainSha256Ok === false) return { bundle: 'image', reason: 'sha-mismatch', quarantine: true };
    if (cmpCore(coreVersion, manifest.minCoreVersion) < 0) {
        return { bundle: 'image', reason: 'requires-core', quarantine: false };
    }
    if (!payloadNewerThanCore(manifest.version, coreVersion)) {
        return { bundle: 'image', reason: 'core-supersedes', quarantine: false };
    }
    if (bootAttempts >= MAX_BOOT_ATTEMPTS) {
        return { bundle: 'image', reason: 'crash-loop', quarantine: true };
    }
    return { bundle: 'ota', reason: 'ok', quarantine: false };
}

// --- fs helpers -----------------------------------------------------------

function readJson(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
        return null;
    }
}

function writeJsonAtomic(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, p);
}

// --- runner ---------------------------------------------------------------

function runLoader() {
    const dataDir = process.env.HMIP_DATA_DIR || '/data';
    const otaDir = path.join(dataDir, 'ota');
    const activeDir = path.join(otaDir, 'active');
    const statePath = path.join(otaDir, 'state.json');
    const coreVersion = process.env.HMIP_VERSION || '0.0.0';
    const imageIndex = path.join(__dirname, '..', 'index.js');

    const state = readJson(statePath) || {
        activeVersion: null,
        bootAttempts: 0,
        lastGoodAt: 0,
        quarantined: [],
    };

    const mainPath = path.join(activeDir, 'main.js');
    const manifestPath = path.join(activeDir, 'manifest.json');
    const hasActiveMain = fs.existsSync(mainPath);
    const manifest = readJson(manifestPath);

    let mainSha256Ok;
    if (hasActiveMain && manifest && manifest.mainSha256) {
        const h = crypto.createHash('sha256').update(fs.readFileSync(mainPath)).digest('hex');
        mainSha256Ok = h === manifest.mainSha256;
    }

    const decision = decideBundle({
        hasActiveMain,
        manifest,
        mainSha256Ok,
        coreVersion,
        bootAttempts: state.bootAttempts || 0,
    });
    console.log(`[loader] core=${coreVersion} decision=${decision.bundle} (${decision.reason})`);

    const quarantine = (ver) => {
        if (ver) state.quarantined = Array.from(new Set([...(state.quarantined || []), ver]));
        try {
            fs.rmSync(activeDir, { recursive: true, force: true });
        } catch (_) {
            /* ignore */
        }
        state.activeVersion = null;
        state.bootAttempts = 0;
        writeJsonAtomic(statePath, state);
    };

    const bootImage = () => {
        process.env.HMIP_OTA_ACTIVE = '0';
        delete process.env.HMIP_OTA_VERSION;
        global.__otaMarkHealthy = () => {};
        const mod = require(imageIndex);
        Promise.resolve(mod.main()).catch((err) => {
            console.error('[loader] image main() failed:', err);
            process.exit(1);
        });
    };

    if (decision.quarantine) {
        quarantine(manifest && manifest.version);
    }

    if (decision.bundle !== 'ota') {
        return bootImage();
    }

    // Boot the OTA payload.
    state.bootAttempts = (state.bootAttempts || 0) + 1;
    writeJsonAtomic(statePath, state);
    process.env.HMIP_OTA_ACTIVE = '1';
    process.env.HMIP_OTA_VERSION = manifest.version;
    global.__otaMarkHealthy = () => {
        const s = readJson(statePath) || state;
        s.bootAttempts = 0;
        s.lastGoodAt = Date.now();
        s.activeVersion = manifest.version;
        writeJsonAtomic(statePath, s);
    };

    try {
        const mod = require(mainPath);
        const mainFn = mod && (mod.main || (mod.default && mod.default.main));
        if (typeof mainFn !== 'function') throw new Error('payload has no main()');
        Promise.resolve(mainFn()).catch((err) => {
            console.error('[loader] OTA main() failed, rolling back:', err);
            quarantine(manifest.version);
            bootImage();
        });
    } catch (err) {
        console.error('[loader] OTA require failed, rolling back:', err);
        quarantine(manifest.version);
        bootImage();
    }
}

module.exports = { decideBundle, MAX_BOOT_ATTEMPTS, runLoader };

if (require.main === module) runLoader();
