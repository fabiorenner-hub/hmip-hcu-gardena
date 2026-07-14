'use strict';

/**
 * OTA manifest validation. A manifest points at a bundle asset and carries the
 * integrity + compatibility metadata the manager/loader rely on.
 */

const SEMVER_RE = /^\d+\.\d+\.\d+(\+[\w.]+)?$/;

function isSemver(v) {
    return SEMVER_RE.test(String(v || ''));
}

function validateManifest(m) {
    if (!m || typeof m !== 'object') return { ok: false, reason: 'not-object' };
    if (!isSemver(m.version)) return { ok: false, reason: 'bad-version' };
    if (!isSemver(m.minCoreVersion)) return { ok: false, reason: 'bad-min-core' };
    if (!/^[0-9a-f]{64}$/.test(String(m.sha256 || ''))) return { ok: false, reason: 'bad-sha' };
    if (!/^https:/.test(String(m.assetUrl || ''))) return { ok: false, reason: 'bad-url' };
    return { ok: true };
}

module.exports = { validateManifest, isSemver };
