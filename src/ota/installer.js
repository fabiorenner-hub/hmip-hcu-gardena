'use strict';

const fs = require('fs');
const path = require('path');
const { sha256Hex, verifySignature } = require('./verify');

/**
 * Only `main.js` and files under `src/` or `public/` may be written, and never
 * anything that could escape the staging directory.
 */
function isSafeBundlePath(p) {
    if (typeof p !== 'string' || !p) return false;
    if (p.includes('..')) return false;
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
    if (p === 'main.js') return true;
    return p.startsWith('src/') || p.startsWith('public/');
}

function parseBundleFile(bundleBytes) {
    const obj = JSON.parse(bundleBytes.toString('utf8'));
    if (!obj || typeof obj !== 'object' || typeof obj.files !== 'object') {
        throw new Error('bad-bundle');
    }
    return obj;
}

/**
 * Verify + unpack a bundle into /data/ota/active atomically. On any failure
 * the existing active/ is left untouched.
 */
function installBundle({ manifest, bundleBytes, dataDir, publicKeyPem }) {
    if (sha256Hex(bundleBytes) !== manifest.sha256) return { ok: false, reason: 'sha-mismatch' };
    if (!verifySignature(bundleBytes, manifest.signature, publicKeyPem)) {
        return { ok: false, reason: 'verify-failed' };
    }

    let bundle;
    try {
        bundle = parseBundleFile(bundleBytes);
    } catch (_) {
        return { ok: false, reason: 'bad-bundle' };
    }

    const otaDir = path.join(dataDir, 'ota');
    const staging = path.join(otaDir, 'staging');
    const active = path.join(otaDir, 'active');
    const activeOld = path.join(otaDir, 'active.old');

    try {
        fs.rmSync(staging, { recursive: true, force: true });
    } catch (_) {
        /* ignore */
    }
    fs.mkdirSync(staging, { recursive: true });

    for (const [rel, b64] of Object.entries(bundle.files)) {
        if (!isSafeBundlePath(rel)) {
            fs.rmSync(staging, { recursive: true, force: true });
            return { ok: false, reason: 'unsafe-path' };
        }
        const dest = path.join(staging, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    }

    const mainStaged = path.join(staging, 'main.js');
    if (!fs.existsSync(mainStaged)) {
        fs.rmSync(staging, { recursive: true, force: true });
        return { ok: false, reason: 'no-main' };
    }
    // The loader validates active/main.js against this hash on next boot.
    const mainSha256 = sha256Hex(fs.readFileSync(mainStaged));
    fs.writeFileSync(
        path.join(staging, 'manifest.json'),
        JSON.stringify({ ...manifest, mainSha256 }, null, 2),
    );

    try {
        fs.rmSync(activeOld, { recursive: true, force: true });
    } catch (_) {
        /* ignore */
    }
    if (fs.existsSync(active)) fs.renameSync(active, activeOld);
    fs.renameSync(staging, active);
    try {
        fs.rmSync(activeOld, { recursive: true, force: true });
    } catch (_) {
        /* ignore */
    }

    return { ok: true, version: manifest.version };
}

module.exports = { installBundle, isSafeBundlePath, parseBundleFile };
