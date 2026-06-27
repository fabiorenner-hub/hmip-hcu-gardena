'use strict';

/**
 * Lightweight dashboard server for the Gardena bridge.
 *
 * The rest of this plugin is plain CommonJS with `ws` as its only dependency
 * and runs on the npm-less-friendly alpine-node-simple image, so the dashboard
 * deliberately avoids a TypeScript/Preact/ESBuild toolchain. It is a no-build
 * vanilla SPA served by Node's built-in http server. It still follows the
 * design-spec: dark-glass look, DE/EN i18n, the mandatory tabs (Darstellung &
 * Sprache, Diagnose, Logs & Debug + 360° export, Updates, Hilfe), live SSE and
 * clear loading/empty/error states.
 *
 * Starting the dashboard is non-fatal: a bind error must never kill the bridge
 * (design-spec §11.1).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const logger = require('./logger');
const cfg = require('./config');
const { APP_VERSION, BUILD_ID, GITHUB_URL } = require('./version');
const { isExposable, deviceIdFor } = require('./device-mapper');

const PUBLIC_DIR = path.join(__dirname, 'public');

// The Dockerfile EXPOSE + HEALTHCHECK are fixed to this port at build time.
// A /health endpoint must always be reachable here so the container reports
// Docker "healthy" (which is what lets the HCU finish installing), regardless
// of whether the user disabled the dashboard or moved it to another port.
const HEALTH_PORT = Number(process.env.HMIP_HEALTH_PORT || 8093);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function maskSecret(v) {
    if (!v) return '';
    const s = String(v);
    if (s.length <= 4) return '••••';
    return `${s.slice(0, 2)}••••${s.slice(-2)}`;
}

class Dashboard {
    constructor(plugin) {
        this.plugin = plugin;
        this._servers = [];
        this._sseClients = new Set();
        this._sseTimer = null;
        this._startedAt = Date.now();
    }

    start() {
        const port = cfg.dashboard.port;
        if (cfg.dashboard.enabled) {
            this._listen(port, true);
            // Keep the fixed health port answering even when the UI uses a
            // different port, so the Docker HEALTHCHECK never breaks.
            if (port !== HEALTH_PORT) this._listen(HEALTH_PORT, false);
            this._sseTimer = setInterval(() => this._broadcastState(), 3000);
        } else {
            logger.info('Dashboard UI disabled via config; serving /health only on :' + HEALTH_PORT);
            this._listen(HEALTH_PORT, false);
        }
    }

    _listen(port, fullUi) {
        try {
            const server = http.createServer((req, res) => this._handle(req, res, fullUi));
            server.on('error', (err) => {
                logger.warn(`Dashboard server on :${port} error (non-fatal):`, err.message);
            });
            server.listen(port, '0.0.0.0', () => {
                logger.info(`${fullUi ? 'Dashboard' : 'Health endpoint'} listening on :${port}`);
            });
            this._servers.push(server);
        } catch (err) {
            logger.warn(`Dashboard failed to bind :${port} (non-fatal):`, err.message);
        }
    }

    stop() {
        if (this._sseTimer) clearInterval(this._sseTimer);
        for (const c of this._sseClients) {
            try {
                c.end();
            } catch (_) {
                /* ignore */
            }
        }
        this._sseClients.clear();
        for (const s of this._servers) {
            try {
                s.close();
            } catch (_) {
                /* ignore */
            }
        }
        this._servers = [];
    }

    // --- request routing ---------------------------------------------------

    _handle(req, res, fullUi) {
        const url = new URL(req.url, `http://localhost`);
        const p = url.pathname;
        try {
            // Always-on health probe, independent of the dashboard toggle/port.
            if (p === '/health' || p === '/api/health') {
                return this._json(res, {
                    status: 'ok',
                    dashboardEnabled: cfg.dashboard.enabled,
                    dashboardPort: cfg.dashboard.port,
                });
            }
            if (!fullUi) {
                // Health-only listener: don't expose any data here.
                return this._json(res, { status: 'ok' });
            }
            if (p === '/api/stream') return this._sse(req, res);
            if (p === '/api/state') return this._json(res, this._state());
            if (p === '/api/config') return this._json(res, this._config());
            if (p === '/api/diagnostics') return this._json(res, this._diagnostics());
            if (p === '/api/metrics') return this._json(res, this._metrics());
            if (p === '/api/logs') return this._json(res, { lines: logger.getRecentLogs() });
            if (p.startsWith('/api/')) return this._json(res, { error: { code: 404, message: 'Not found' } }, 404);
            return this._static(p, res);
        } catch (err) {
            logger.warn('Dashboard request failed:', err.message);
            this._json(res, { error: { code: 500, message: err.message } }, 500);
        }
    }

    _json(res, obj, code = 200) {
        const body = JSON.stringify(obj);
        res.writeHead(code, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        res.end(body);
    }

    _static(pathname, res) {
        let rel = pathname === '/' ? '/index.html' : pathname;
        rel = rel.replace(/\.\.+/g, '.'); // basic traversal guard
        let file = path.join(PUBLIC_DIR, rel);
        if (!file.startsWith(PUBLIC_DIR)) file = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(file, (err, data) => {
            if (err) {
                // SPA fallback: unknown non-asset routes return index.html.
                return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
                    if (e2) {
                        res.writeHead(404);
                        return res.end('Not found');
                    }
                    res.writeHead(200, { 'Content-Type': MIME['.html'] });
                    res.end(html);
                });
            }
            const ext = path.extname(file).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
    }

    // --- SSE ----------------------------------------------------------------

    _sse(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write(`retry: 5000\n\n`);
        this._writeSse(res, 'state', this._state());
        this._sseClients.add(res);
        req.on('close', () => this._sseClients.delete(res));
    }

    _writeSse(res, event, data) {
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (_) {
            this._sseClients.delete(res);
        }
    }

    _broadcastState() {
        if (!this._sseClients.size) return;
        const state = this._state();
        for (const res of this._sseClients) this._writeSse(res, 'state', state);
    }

    // --- state assembly -----------------------------------------------------

    _devices() {
        const g = this.plugin.gardena;
        const included = this.plugin.includedDevices;
        return g
            .listServices()
            .filter(isExposable)
            .map((svc) => {
                const owner = g.getDevice(svc.deviceId) || {};
                const st = svc.state || {};
                const lux = typeof st.lightIntensity === 'number' ? st.lightIntensity : st.illumination;
                return {
                    deviceId: deviceIdFor(svc.id),
                    name: svc.name || svc.id,
                    type: svc.type,
                    included: included.has(deviceIdFor(svc.id)),
                    battery: typeof owner.batteryLevel === 'number' ? owner.batteryLevel : null,
                    batteryState: owner.batteryState || null,
                    rfLink: owner.rfLinkState || null,
                    activity: st.activity || null,
                    temperature:
                        typeof st.soilTemperature === 'number'
                            ? st.soilTemperature
                            : typeof st.ambientTemperature === 'number'
                              ? st.ambientTemperature
                              : null,
                    humidity: typeof st.soilHumidity === 'number' ? st.soilHumidity : (st.humidity ?? null),
                    // Raw lux from the sensor (can exceed 100000) plus the value
                    // the HMIP app actually receives (capped at 20000 by the
                    // Connect API Illumination feature, spec §6.7.15).
                    luxRaw: typeof lux === 'number' ? lux : null,
                    luxReported: typeof lux === 'number' ? Math.max(0, Math.min(20000, lux)) : null,
                };
            });
    }

    _state() {
        const g = this.plugin.gardena;
        const devices = this._devices();
        return {
            version: APP_VERSION,
            buildId: BUILD_ID,
            pluginId: cfg.pluginId,
            githubUrl: GITHUB_URL,
            timestamp: new Date().toISOString(),
            hcu: { connected: this.plugin.hcu.connected },
            gardena: {
                connected: g.connected,
                rateLimited: g.rateLimited,
                lastError: g.lastError || null,
                configured: Boolean(cfg.gardena.clientId && cfg.gardena.clientSecret),
            },
            counts: {
                devices: devices.length,
                included: devices.filter((d) => d.included).length,
            },
            devices,
        };
    }

    _config() {
        return {
            clientId: maskSecret(cfg.gardena.clientId),
            clientSecret: cfg.gardena.clientSecret ? '••••••••' : '',
            locationId: cfg.gardena.locationId || '',
            valveDurationSec: cfg.gardena.defaultValveDurationSec,
            dashboardPort: cfg.dashboard.port,
        };
    }

    _diagnostics() {
        const g = this.plugin.gardena;
        return {
            hcuConnected: this.plugin.hcu.connected,
            gardenaConnected: g.connected,
            gardenaRateLimited: g.rateLimited,
            lastError: g.lastError || null,
            uptimeSec: Math.round((Date.now() - this._startedAt) / 1000),
            node: process.version,
            buildId: BUILD_ID,
            pluginId: cfg.pluginId,
        };
    }

    _metrics() {
        const m = process.memoryUsage();
        return {
            uptimeSec: Math.round(process.uptime()),
            rssMb: Math.round((m.rss / 1048576) * 10) / 10,
            heapUsedMb: Math.round((m.heapUsed / 1048576) * 10) / 10,
        };
    }
}

module.exports = { Dashboard };
