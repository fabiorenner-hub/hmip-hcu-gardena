'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { decideBundle, MAX_BOOT_ATTEMPTS } = require('../src/bootstrap/loader');
const semver = require('../src/ota/semver');
const { validateManifest } = require('../src/ota/manifest');
const { isSafeBundlePath } = require('../src/ota/installer');

const goodManifest = { version: '1.4.0', minCoreVersion: '1.3.0' };

test('decideBundle: no active payload -> image', () => {
    assert.deepEqual(
        decideBundle({ hasActiveMain: false, coreVersion: '1.3.0', bootAttempts: 0 }).bundle,
        'image',
    );
});

test('decideBundle: sha mismatch -> image + quarantine', () => {
    const d = decideBundle({
        hasActiveMain: true,
        manifest: goodManifest,
        mainSha256Ok: false,
        coreVersion: '1.3.0',
        bootAttempts: 0,
    });
    assert.equal(d.bundle, 'image');
    assert.equal(d.quarantine, true);
});

test('decideBundle: requires newer core -> image, no quarantine', () => {
    const d = decideBundle({
        hasActiveMain: true,
        manifest: { version: '2.0.0', minCoreVersion: '1.9.0' },
        mainSha256Ok: true,
        coreVersion: '1.3.0',
        bootAttempts: 0,
    });
    assert.equal(d.reason, 'requires-core');
    assert.equal(d.quarantine, false);
});

test('decideBundle: payload not newer than core -> image', () => {
    const d = decideBundle({
        hasActiveMain: true,
        manifest: { version: '1.3.0', minCoreVersion: '1.3.0' },
        mainSha256Ok: true,
        coreVersion: '1.3.0',
        bootAttempts: 0,
    });
    assert.equal(d.reason, 'core-supersedes');
});

test('decideBundle: crash loop -> image + quarantine', () => {
    const d = decideBundle({
        hasActiveMain: true,
        manifest: goodManifest,
        mainSha256Ok: true,
        coreVersion: '1.3.0',
        bootAttempts: MAX_BOOT_ATTEMPTS,
    });
    assert.equal(d.reason, 'crash-loop');
    assert.equal(d.quarantine, true);
});

test('decideBundle: healthy newer payload -> ota', () => {
    const d = decideBundle({
        hasActiveMain: true,
        manifest: goodManifest,
        mainSha256Ok: true,
        coreVersion: '1.3.0',
        bootAttempts: 0,
    });
    assert.equal(d.bundle, 'ota');
});

test('semver experimental build ordering', () => {
    assert.equal(semver.isNewerWithBuild('1.3.0+exp.20260714', '1.3.0'), true);
    assert.equal(semver.isNewer('1.3.0+exp.20260714', '1.3.0'), false);
    assert.equal(semver.isNewerWithBuild('1.4.0', '1.3.0+exp.99999999'), true);
});

test('manifest validation rejects bad sha / url', () => {
    assert.equal(validateManifest({ version: '1.4.0', minCoreVersion: '1.3.0', sha256: 'x', assetUrl: 'https://a' }).ok, false);
    assert.equal(
        validateManifest({ version: '1.4.0', minCoreVersion: '1.3.0', sha256: 'a'.repeat(64), assetUrl: 'http://insecure' }).ok,
        false,
    );
    assert.equal(
        validateManifest({ version: '1.4.0', minCoreVersion: '1.3.0', sha256: 'a'.repeat(64), assetUrl: 'https://ok' }).ok,
        true,
    );
});

test('bundle path traversal guard', () => {
    assert.equal(isSafeBundlePath('main.js'), true);
    assert.equal(isSafeBundlePath('src/index.js'), true);
    assert.equal(isSafeBundlePath('../evil.js'), false);
    assert.equal(isSafeBundlePath('/etc/passwd'), false);
    assert.equal(isSafeBundlePath('C:/x'), false);
    assert.equal(isSafeBundlePath('node_modules/x'), false);
});
