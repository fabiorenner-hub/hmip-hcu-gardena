'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Minimal, privacy-preserving usage ping. Opt-out (enabled by default).
 *
 * The ingest endpoint is a fixed module constant, stored base64-encoded only,
 * and is NOT configurable, NOT shown in the UI and NOT documented. A config
 * "endpoint" would be ignored on purpose.
 *
 * The payload NEVER contains PII, serials/SGTIN, tokens, IPs, names, rooms,
 * device names/addresses, sensor values, automations, schedules, config or
 * location — only anonymous build/version counters keyed by an opaque,
 * randomly-seeded install id.
 */
const ENDPOINT_B64 = 'aHR0cHM6Ly9oY3UuZmFiaW9yZW5uZXIuZGUvaW5nZXN0LnBocA==';
const ENDPOINT = Buffer.from(ENDPOINT_B64, 'base64').toString('utf8');

const INSTALL_ID_SALT = 'hmip-gardena-plugin';
const MAX_BYTES = 4096;
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 15 * 60 * 1000;

class CallHome {
    constructor({ dataDir, getConfig, buildMeta, fetchImpl, logger }) {
        this.dataDir = dataDir;
        this.getConfig = getConfig;
        this.buildMeta = buildMeta || (() => ({}));
        this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
        this.log = logger || (() => {});
        this._installId = null;
        this._timers = [];
        this._lastVersionFile = path.join(dataDir, '.plugin-version');
    }

    enabled() {
        const c = this.getConfig() || {};
        return !(c.analytics && c.analytics.enabled === false);
    }

    intervalHours() {
        const c = this.getConfig() || {};
        const h = c.analytics && c.analytics.intervalHours;
        return Number.isFinite(h) && h >= 1 && h <= 168 ? h : 24;
    }

    installId() {
        if (this._installId) return this._installId;
        const idPath = path.join(this.dataDir, 'analytics-id');
        try {
            const existing = fs.readFileSync(idPath, 'utf8').trim();
            if (/^[0-9a-f]{64}$/.test(existing)) {
                this._installId = existing;
                return existing;
            }
        } catch (_) {
            /* generate below */
        }
        const id = crypto
            .createHash('sha256')
            .update(`${INSTALL_ID_SALT}|${crypto.randomUUID()}`)
            .digest('hex');
        try {
            fs.mkdirSync(this.dataDir, { recursive: true });
            fs.writeFileSync(idPath, id, { mode: 0o600 });
        } catch (e) {
            this.log('analytics id persist failed: ' + e.message);
        }
        this._installId = id;
        return id;
    }

    buildPayload(event) {
        const meta = this.buildMeta() || {};
        const payload = {
            schema: 1,
            event,
            installId: this.installId(),
            pluginId: meta.pluginId,
            coreVersion: meta.coreVersion,
            otaVersion: meta.otaVersion,
            // ISO 8601 UTC — the ingest endpoint validates this and rejects a
            // numeric epoch with HTTP 400.
            ts: new Date().toISOString(),
        };
        if (meta.buildId) payload.buildId = meta.buildId;
        if (meta.arch) payload.arch = meta.arch;
        if (meta.lang) payload.lang = meta.lang;
        if (meta.hcuFirmware) payload.hcuFirmware = meta.hcuFirmware;
        return payload;
    }

    /** Exact payload for the UI preview — deliberately WITHOUT the endpoint. */
    preview(event = 'heartbeat') {
        return this.buildPayload(event);
    }

    async _send(event, allowRetry = true) {
        if (!this.enabled()) return;
        const payload = this.buildPayload(event);
        const body = JSON.stringify(payload);
        if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
            this.log('analytics payload too large, dropped');
            return;
        }
        const c = this.getConfig() || {};
        const headers = { 'Content-Type': 'application/json' };
        if (c.analytics && c.analytics.pingSecret) headers['X-HPA-Ping-Secret'] = c.analytics.pingSecret;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await this.fetchImpl(ENDPOINT, {
                method: 'POST',
                headers,
                body,
                signal: ctrl.signal,
            });
            if (res && res.status >= 200 && res.status < 300) {
                this._lastSuccess = Date.now();
                return;
            }
            throw new Error('status ' + (res && res.status));
        } catch (err) {
            this.log('analytics send failed (' + event + '): ' + err.message);
            if (allowRetry) {
                const t = setTimeout(() => this._send(event, false).catch(() => {}), RETRY_DELAY_MS);
                if (t.unref) t.unref();
                this._timers.push(t);
            }
        } finally {
            clearTimeout(timer);
        }
    }

    /** Fire the one-time "update" event if the running version changed. */
    reportUpdate() {
        const meta = this.buildMeta() || {};
        const current = String(meta.otaVersion || meta.coreVersion || '');
        let last = '';
        try {
            last = fs.readFileSync(this._lastVersionFile, 'utf8').trim();
        } catch (_) {
            /* first boot */
        }
        if (current && current !== last) {
            try {
                fs.mkdirSync(this.dataDir, { recursive: true });
                fs.writeFileSync(this._lastVersionFile, current);
            } catch (_) {
                /* ignore */
            }
            if (last) this._send('update').catch(() => {});
        }
    }

    start() {
        // start ping ~60s after boot
        const startT = setTimeout(() => this._send('start').catch(() => {}), 60 * 1000);
        if (startT.unref) startT.unref();
        this._timers.push(startT);
        // heartbeat
        const hb = setInterval(
            () => this._send('heartbeat').catch(() => {}),
            this.intervalHours() * 3600 * 1000,
        );
        if (hb.unref) hb.unref();
        this._timers.push(hb);
        this.reportUpdate();
    }

    stop() {
        for (const t of this._timers) {
            clearTimeout(t);
            clearInterval(t);
        }
        this._timers = [];
    }
}

module.exports = { CallHome };
