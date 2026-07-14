'use strict';

/**
 * Minimal semver helpers. Versions may carry a build tail for experimental
 * builds: `X.Y.Z+exp.<utcstamp>`. The build tail sorts lexicographically
 * (UTC timestamps compare correctly as strings).
 */

function parse(v) {
    const [core, build = ''] = String(v || '').split('+');
    const m = core.match(/^(\d+)\.(\d+)\.(\d+)/);
    return { parts: m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0], build };
}

function cmpCore(a, b) {
    const pa = parse(a).parts;
    const pb = parse(b).parts;
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    }
    return 0;
}

/** a strictly newer than b, ignoring any build tail. */
function isNewer(a, b) {
    return cmpCore(a, b) > 0;
}

/** v >= min (X.Y.Z only). */
function isAtLeast(v, min) {
    return cmpCore(v, min) >= 0;
}

/**
 * a newer than b, taking the build tail into account. Same X.Y.Z: a build
 * tail beats no tail; two tails compare lexicographically. A higher X.Y.Z
 * always wins over any build of a lower X.Y.Z.
 */
function isNewerWithBuild(a, b) {
    const c = cmpCore(a, b);
    if (c !== 0) return c > 0;
    const ba = parse(a).build;
    const bb = parse(b).build;
    if (ba && !bb) return true;
    if (ba && bb) return ba > bb;
    return false;
}

module.exports = { parse, cmpCore, isNewer, isAtLeast, isNewerWithBuild };
