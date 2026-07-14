'use strict';

/**
 * GitHub Releases access for the OTA manager. Anonymous (public repo), best
 * effort. `fetchImpl` is injectable for tests.
 */

const UA = 'hmip-hcu-gardena';

async function fetchJson(url, fetchImpl) {
    const res = await fetchImpl(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
    return res.json();
}

async function fetchLatestRelease(repo, fetchImpl) {
    return fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, fetchImpl);
}

async function fetchLatestPrerelease(repo, fetchImpl) {
    const releases = await fetchJson(`https://api.github.com/repos/${repo}/releases`, fetchImpl);
    return (releases || []).find((r) => r.prerelease) || null;
}

function findAsset(release, name) {
    return (release && release.assets ? release.assets : []).find((a) => a.name === name) || null;
}

async function downloadAsset(url, fetchImpl) {
    const res = await fetchImpl(url, {
        headers: { 'User-Agent': UA, Accept: 'application/octet-stream' },
    });
    if (!res.ok) throw new Error(`asset download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

module.exports = { fetchLatestRelease, fetchLatestPrerelease, findAsset, downloadAsset };
