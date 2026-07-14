#!/usr/bin/env node
'use strict';

/**
 * Build an OTA bundle + manifest from the current src/ tree.
 *
 *   node scripts/build-ota.mjs [stable|experimental]
 *
 * Stable:       version = package.json version, tag vX.Y.Z, fixed manifest name.
 * Experimental: version = X.Y.Z+exp.<utcstamp>, rolling tag `experimental`,
 *               fixed asset names so the prerelease can be --clobber'd.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const REPO = 'fabiorenner-hub/hmip-hcu-gardena';
const NAME = 'hmip-gardena-plugin';
const MIN_CORE = '1.3.0'; // first loader-capable core version

const channel = process.argv[2] === 'experimental' ? 'experimental' : 'stable';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const version = channel === 'experimental' ? `${pkg.version}+exp.${stamp}` : pkg.version;

const files = {};
files['main.js'] = Buffer.from('module.exports = require("./src/index.js");\n').toString('base64');

function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(abs, r);
        else files[`src/${r}`] = fs.readFileSync(abs).toString('base64');
    }
}
walk(path.join(root, 'src'), '');

const bundleJson = JSON.stringify({ format: 'hmip-gardena-ota-1', version, files });
const sha256 = crypto.createHash('sha256').update(Buffer.from(bundleJson, 'utf8')).digest('hex');

const bundleName = channel === 'experimental' ? `${NAME}-ota-exp.json` : `${NAME}-ota-${version}.json`;
const manifestName = channel === 'experimental' ? 'ota-manifest-exp.json' : 'ota-manifest.json';
const tag = channel === 'experimental' ? 'experimental' : `v${version}`;
const assetUrl = `https://github.com/${REPO}/releases/download/${tag}/${bundleName}`;

const manifest = {
    version,
    minCoreVersion: MIN_CORE,
    sha256,
    assetUrl,
    bundleName,
    notes: `${channel} build ${version}`,
};

fs.writeFileSync(path.join(root, bundleName), bundleJson);
fs.writeFileSync(path.join(root, manifestName), JSON.stringify(manifest, null, 2));
console.log(
    `Wrote ${bundleName} (${(bundleJson.length / 1024).toFixed(1)} KB) + ${manifestName} [${channel} ${version}]`,
);
