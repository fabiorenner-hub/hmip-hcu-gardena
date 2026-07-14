'use strict';

/**
 * Per-plugin identity constants shared by the OTA loader, manager and
 * analytics. Keep in sync with package.json / Dockerfile LABEL.
 */
module.exports = {
    PLUGIN_ID: process.env.HMIP_PLUGIN_ID || 'de.homematicip.plugin.gardena',
    GITHUB_REPO: 'fabiorenner-hub/hmip-hcu-gardena',
    ENV_PREFIX: 'HMIP',
    DASHBOARD_PORT: 8094,
};
