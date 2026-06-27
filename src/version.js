'use strict';

/**
 * Single source of truth for the running version is package.json. The build id
 * adds a UTC stamp so a live container can be identified unambiguously
 * (design-spec §7).
 */
const pkg = require('../package.json');

const APP_VERSION = pkg.version;
const GITHUB_URL = 'https://github.com/fabiorenner-hub/hmip-hcu-gardena';
const BUILD_ID = `${APP_VERSION}+${new Date().toISOString().replace(/[:.]/g, '').replace('T', '.').slice(0, 15)}`;

module.exports = { APP_VERSION, GITHUB_URL, BUILD_ID };
