'use strict';

/**
 * Version resolution that works both in the image and inside an OTA payload
 * (which has NO package.json). The core version comes from the Dockerfile env
 * HMIP_VERSION; the running version is the OTA payload version when one is
 * active, otherwise the core version. package.json is only a local-dev
 * fallback and is read defensively.
 */
let pkgVersion = '0.0.0';
try {
    pkgVersion = require('../package.json').version || pkgVersion;
} catch (_) {
    /* no package.json in OTA payload — fall back to env below */
}

const CORE_VERSION = process.env.HMIP_VERSION || pkgVersion;
const RUNNING_VERSION = process.env.HMIP_OTA_VERSION || CORE_VERSION;
const APP_VERSION = RUNNING_VERSION;
const GITHUB_URL = 'https://github.com/fabiorenner-hub/hmip-hcu-gardena';
const BUILD_ID = `${RUNNING_VERSION}+${new Date().toISOString().replace(/[:.]/g, '').replace('T', '.').slice(0, 15)}`;

module.exports = { APP_VERSION, CORE_VERSION, RUNNING_VERSION, GITHUB_URL, BUILD_ID };
