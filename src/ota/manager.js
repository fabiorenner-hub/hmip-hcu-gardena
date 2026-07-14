'use strict';

const { readState } = require('./state');
const semver = require('./semver');
const { validateManifest } = require('./manifest');
const github = require('./github');
const { installBundle } = require('./installer');

const MANIFEST_ASSET = { stable: 'ota-manifest.json', experimental: 'ota-manifest-exp.json' };

class OtaManager {
    constructor({ getConfig, dataDir, coreVersion, fetchImpl, requestRestart, publicKeyPem, log, repo }) {
        this.getConfig = getConfig;
        this.dataDir = dataDir;
        this.coreVersion = coreVersion;
        this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
        this.requestRestart = requestRestart || (() => {});
        this.publicKeyPem = publicKeyPem || null;
        this.log = log || (() => {});
        this.repo = repo;
        this._checking = false;
        this._latest = null;
        this._latestManifest = null;
        this._latestReleaseUrl = null;
        this._lastError = null;
        this._timer = null;
        this._interval = null;
    }

    getChannel() {
        const c = this.getConfig() || {};
        return (c.updates && c.updates.channel) === 'experimental' ? 'experimental' : 'stable';
    }

    getMode() {
        const c = this.getConfig() || {};
        return (c.updates && c.updates.mode) === 'auto' ? 'auto' : 'manual';
    }

    otaVersion() {
        return process.env.HMIP_OTA_VERSION || this.coreVersion;
    }

    _isNewer(a, b) {
        return this.getChannel() === 'experimental'
            ? semver.isNewerWithBuild(a, b)
            : semver.isNewer(a, b);
    }

    async _loadManifest(release) {
        const name = MANIFEST_ASSET[this.getChannel()];
        const asset = github.findAsset(release, name);
        if (!asset) throw new Error(`manifest asset ${name} missing`);
        const bytes = await github.downloadAsset(asset.browser_download_url, this.fetchImpl);
        const manifest = JSON.parse(bytes.toString('utf8'));
        const v = validateManifest(manifest);
        if (!v.ok) throw new Error(`bad manifest: ${v.reason}`);
        return manifest;
    }

    async check() {
        this._checking = true;
        this._lastError = null;
        try {
            const release =
                this.getChannel() === 'experimental'
                    ? await github.fetchLatestPrerelease(this.repo, this.fetchImpl)
                    : await github.fetchLatestRelease(this.repo, this.fetchImpl);
            if (!release) {
                this._latest = null;
                return this.getStatus();
            }
            const manifest = await this._loadManifest(release);
            this._latestManifest = manifest;
            this._latestReleaseUrl = release.html_url || null;
            const cur = this.otaVersion();
            const newer = this._isNewer(manifest.version, cur);
            const requiresCore = !semver.isAtLeast(this.coreVersion, manifest.minCoreVersion);
            this._latest = { version: manifest.version, newer, requiresCore };
            if (newer && !requiresCore && this.getMode() === 'auto') {
                this.install().catch((e) => this.log('auto-install failed: ' + e.message));
            }
            return this.getStatus();
        } catch (err) {
            this._lastError = err.message;
            this.log('OTA check failed: ' + err.message);
            return this.getStatus();
        } finally {
            this._checking = false;
        }
    }

    async install() {
        const manifest = this._latestManifest;
        if (!manifest) return { ok: false, reason: 'no-manifest' };
        if (!this._isNewer(manifest.version, this.otaVersion())) {
            return { ok: false, reason: 'already-current' };
        }
        if (!semver.isAtLeast(this.coreVersion, manifest.minCoreVersion)) {
            return { ok: false, reason: 'requires-core' };
        }
        const bytes = await github.downloadAsset(manifest.assetUrl, this.fetchImpl);
        const res = installBundle({
            manifest,
            bundleBytes: bytes,
            dataDir: this.dataDir,
            publicKeyPem: this.publicKeyPem,
        });
        if (!res.ok) {
            this.log('OTA install failed: ' + res.reason);
            return res;
        }
        this.log('OTA installed ' + res.version + ', restarting');
        this.requestRestart();
        return { ok: true, version: res.version };
    }

    getStatus() {
        const st = readState(this.dataDir);
        return {
            coreVersion: this.coreVersion,
            otaVersion: this.otaVersion(),
            otaActive: process.env.HMIP_OTA_ACTIVE === '1',
            channel: this.getChannel(),
            mode: this.getMode(),
            latest: this._latest ? this._latest.version : null,
            updateAvailable: this._latest ? this._latest.newer : false,
            requiresCore: this._latest ? this._latest.requiresCore : false,
            checking: this._checking,
            lastError: this._lastError,
            bootAttempts: st.bootAttempts || 0,
            quarantined: st.quarantined || [],
            lastGoodAt: st.lastGoodAt || 0,
            releaseUrl: this._latestReleaseUrl,
        };
    }

    start() {
        const c = this.getConfig() || {};
        const hours = (c.updates && c.updates.checkIntervalHours) || 6;
        this._timer = setTimeout(() => {
            this.check().catch(() => {});
            this._interval = setInterval(() => this.check().catch(() => {}), hours * 3600 * 1000);
            if (this._interval.unref) this._interval.unref();
        }, 60 * 1000);
        if (this._timer.unref) this._timer.unref();
    }

    stop() {
        if (this._timer) clearTimeout(this._timer);
        if (this._interval) clearInterval(this._interval);
    }
}

module.exports = { OtaManager };
