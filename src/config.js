'use strict';

/**
 * Central configuration with three-layer precedence:
 *
 *   1. Persisted config (data/config.json — written by the HCUweb form)
 *   2. Environment variables (remote dev convenience)
 *   3. Hard-coded defaults
 *
 * HCU auth token precedence:
 *   1. /TOKEN file (installed plugin, managed by the HCU)
 *   2. HMIP_HCU_AUTH_TOKEN env (remote dev)
 */
const fs = require('fs');
const { ConfigStore } = require('./config-store');

const PLUGIN_ID = process.env.HMIP_PLUGIN_ID || 'de.homematicip.plugin.gardena';

function readTokenFile(p) {
    try {
        return fs.readFileSync(p, 'utf8').trim();
    } catch (_) {
        return '';
    }
}

const tokenFromFile = readTokenFile('/TOKEN');
const authToken = tokenFromFile || process.env.HMIP_HCU_AUTH_TOKEN || '';
const isInstalled = Boolean(tokenFromFile);
const defaultHost = isInstalled ? 'host.containers.internal' : 'hcu1.local';

const store = new ConfigStore();
const persisted = store.load();

function pick(key, fallback) {
    if (persisted[key] !== undefined && persisted[key] !== '') return persisted[key];
    if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
    return fallback;
}

function asBool(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    if (typeof v === 'boolean') return v;
    return String(v).toLowerCase() === 'true' || String(v) === '1';
}

function readDashboardPort() {
    const raw = pick('DASHBOARD_PORT', '') || process.env.HMIP_DASHBOARD_PORT || 8093;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : 8093;
}

const cfg = {
    pluginId: PLUGIN_ID,
    isInstalled,
    store,

    hcu: {
        host: process.env.HMIP_HCU_HOST || defaultHost,
        port: Number(process.env.HMIP_HCU_PORT || 9001),
        authToken,
        reconnectDelayMs: 5000,
    },

    gardena: {
        clientId: pick('GARDENA_CLIENT_ID', ''),
        clientSecret: pick('GARDENA_CLIENT_SECRET', ''),
        locationId: pick('GARDENA_LOCATION_ID', ''),
        defaultValveDurationSec: Number(pick('GARDENA_VALVE_DURATION_SEC', 30 * 60)),
        authBase: process.env.GARDENA_AUTH_URL || 'https://api.authentication.husqvarnagroup.dev',
        apiBase: process.env.GARDENA_API_URL || 'https://api.smart.gardena.dev',
        // Keep-alive pings are free (they ride the existing socket, no REST
        // quota). 60s gives a comfortable margin against the server-side idle
        // timeout without spending any rate-limit budget.
        websocketPingIntervalMs: 60 * 1000,
        // Base reconnect delay. The real delay grows exponentially with jitter
        // (see _scheduleReconnect) up to maxReconnectDelayMs so a flapping
        // connection doesn't burn the small Gardena REST quota and trip a 429.
        reconnectDelayMs: 30 * 1000,
        maxReconnectDelayMs: 5 * 60 * 1000,
        // Husqvarna's free developer tier rate-limits hard and answers HTTP 429
        // "Limit Exceeded". Retrying quickly only digs deeper, so on a 429 we
        // back off for a long, fixed cooldown before trying again. (The same
        // pattern the openHAB/Home Assistant Gardena integrations adopted.)
        rateLimitCooldownMs: 60 * 60 * 1000,
        // Only reload the full REST location snapshot when our cache is empty
        // or this stale. Routine websocket reconnects then cost a single POST
        // instead of POST + GET, which keeps us well under the rate limit.
        snapshotMaxAgeMs: 30 * 60 * 1000,
    },

    log: {
        level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
    },

    dashboard: {
        // Toggle + port are user-editable from the HCUweb plugin settings.
        // NOTE: the container's HEALTHCHECK and EXPOSE are fixed to 8093 at
        // build time, so a health endpoint always stays reachable on 8093
        // regardless of these values (see dashboard.js). Picking a different
        // port mainly changes where the UI itself listens.
        enabled: asBool(pick('DASHBOARD_ENABLED', undefined), true),
        port: readDashboardPort(),
    },
};

/**
 * Apply incoming key/value updates from HCUweb. Persisted on success and
 * reflected in the exported singleton so callers see new values immediately.
 */
cfg.applyUpdate = (updates) => {
    const merged = { ...persisted };
    for (const [key, value] of Object.entries(updates || {})) {
        if (value === undefined || value === null) continue;
        merged[key] = typeof value === 'string' ? value.trim() : value;
    }
    store.save(merged);
    Object.assign(persisted, merged);

    cfg.gardena.clientId = pick('GARDENA_CLIENT_ID', cfg.gardena.clientId);
    cfg.gardena.clientSecret = pick('GARDENA_CLIENT_SECRET', cfg.gardena.clientSecret);
    cfg.gardena.locationId = pick('GARDENA_LOCATION_ID', cfg.gardena.locationId);
    cfg.gardena.defaultValveDurationSec = Number(
        pick('GARDENA_VALVE_DURATION_SEC', cfg.gardena.defaultValveDurationSec),
    );
    cfg.dashboard.enabled = asBool(pick('DASHBOARD_ENABLED', undefined), true);
    cfg.dashboard.port = readDashboardPort();
};

module.exports = cfg;
