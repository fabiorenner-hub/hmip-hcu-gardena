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
        websocketPingIntervalMs: 150 * 1000,
        reconnectDelayMs: 30 * 1000,
    },

    log: {
        level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
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
};

module.exports = cfg;
