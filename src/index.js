'use strict';

const logger = require('./logger');
const { GardenaPlugin } = require('./plugin');
const cfg = require('./config');
const { CORE_VERSION, RUNNING_VERSION } = require('./version');
const { OtaManager } = require('./ota/manager');
const { CallHome } = require('./analytics/call-home');
const { GITHUB_REPO, PLUGIN_ID } = require('./plugin-meta');

const DATA_DIR = process.env.HMIP_DATA_DIR || '/data';

async function main() {
    logger.info(
        `Starting ${cfg.pluginId} core=${CORE_VERSION} running=${RUNNING_VERSION} ` +
            `(ota=${process.env.HMIP_OTA_ACTIVE === '1' ? 'on' : 'off'}, log ${cfg.log.level})`,
    );

    const plugin = new GardenaPlugin();

    // OTA self-update (best effort). requestRestart exits the process so the
    // loader boots the freshly installed active bundle on container restart.
    const ota = new OtaManager({
        getConfig: () => cfg,
        dataDir: DATA_DIR,
        coreVersion: CORE_VERSION,
        repo: GITHUB_REPO,
        publicKeyPem: process.env.HMIP_OTA_PUBLIC_KEY || null,
        requestRestart: () => setTimeout(() => process.exit(0), 500),
        log: (m) => logger.info('[ota] ' + m),
    });
    plugin.ota = ota;

    // Anonymous opt-out usage ping.
    const callHome = new CallHome({
        dataDir: DATA_DIR,
        getConfig: () => cfg,
        buildMeta: () => ({
            pluginId: PLUGIN_ID,
            coreVersion: CORE_VERSION,
            otaVersion: RUNNING_VERSION,
            buildId: RUNNING_VERSION,
            arch: process.arch,
            lang: 'de',
        }),
        logger: (m) => logger.debug('[analytics] ' + m),
    });
    plugin.callHome = callHome;

    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down`);
        try {
            ota.stop();
            callHome.stop();
            await plugin.stop();
        } finally {
            process.exit(0);
        }
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (err) => logger.error('unhandledRejection:', err));
    process.on('uncaughtException', (err) => logger.error('uncaughtException:', err));

    await plugin.start();
    ota.start();
    callHome.start();

    // Boot succeeded — let the OTA loader reset its crash-loop counter.
    if (typeof globalThis.__otaMarkHealthy === 'function') {
        globalThis.__otaMarkHealthy();
    }
}

module.exports = { main };

// Allow running directly (dev) without the loader.
if (require.main === module) {
    main().catch((err) => {
        logger.error('Fatal startup error:', err);
        process.exit(1);
    });
}
