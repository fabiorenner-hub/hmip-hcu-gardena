'use strict';

const fs = require('fs');
const path = require('path');

function statePath(dataDir) {
    return path.join(dataDir, 'ota', 'state.json');
}

function readState(dataDir) {
    try {
        return JSON.parse(fs.readFileSync(statePath(dataDir), 'utf8'));
    } catch (_) {
        return { activeVersion: null, bootAttempts: 0, lastGoodAt: 0, quarantined: [] };
    }
}

function writeState(dataDir, state) {
    const p = statePath(dataDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, p);
}

module.exports = { readState, writeState, statePath };
