'use strict';

const { log } = require('./config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[log.level] ?? LEVELS.info;

// In-memory ring buffer so the dashboard "Logs & Debug" tab and the 360°
// export can show recent activity without touching disk.
const RING_SIZE = 500;
const ring = [];

function pushRing(level, parts) {
    const line = {
        ts: new Date().toISOString(),
        level,
        message: parts
            .map((p) => {
                if (p instanceof Error) return p.stack || p.message;
                if (typeof p === 'object') {
                    try {
                        return JSON.stringify(p);
                    } catch (_) {
                        return String(p);
                    }
                }
                return String(p);
            })
            .join(' '),
    };
    ring.push(line);
    if (ring.length > RING_SIZE) ring.shift();
}

function ts() {
    return new Date().toISOString();
}

function make(level) {
    const n = LEVELS[level];
    return (...args) => {
        pushRing(level, args);
        if (n <= current) {
            // eslint-disable-next-line no-console
            console[level === 'debug' ? 'log' : level](`[${ts()}] [${level.toUpperCase()}]`, ...args);
        }
    };
}

module.exports = {
    error: make('error'),
    warn: make('warn'),
    info: make('info'),
    debug: make('debug'),
    /** Return a shallow copy of the recent log ring buffer (oldest first). */
    getRecentLogs() {
        return ring.slice();
    },
};
