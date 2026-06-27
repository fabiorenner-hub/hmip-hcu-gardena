'use strict';

/* ------------------------------------------------------------------ i18n */
const LANG_KEY = 'gardena.lang';
function langPref() {
    return localStorage.getItem(LANG_KEY) || 'AUTO';
}
function activeLang() {
    const p = langPref();
    if (p === 'de' || p === 'en') return p;
    return (navigator.language || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';
}
function t(de, en) {
    return activeLang() === 'en' ? en : de;
}
function fmtNum(n, digits = 0) {
    if (n === null || n === undefined || Number.isNaN(n)) return '–';
    return Number(n).toLocaleString(activeLang() === 'en' ? 'en-US' : 'de-DE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}
function setLang(v) {
    localStorage.setItem(LANG_KEY, v);
    document.documentElement.lang = activeLang();
    render();
}

/* ------------------------------------------------------------------ state */
let STATE = null;
let CURRENT_TAB = location.hash.replace('#', '') || 'overview';
let UPDATE_INFO = { available: false, latest: null };
let bannerDismissed = false;

const TABS = () => [
    { id: 'overview', icon: '🌿', label: t('Übersicht', 'Overview') },
    { id: 'appearance', icon: '🎨', label: t('Darstellung & Sprache', 'Appearance & Language') },
    { id: 'diagnostics', icon: '🩺', label: t('Diagnose', 'Diagnostics') },
    { id: 'logs', icon: '📋', label: t('Logs & Debug', 'Logs & Debug') },
    { id: 'updates', icon: '⬆️', label: t('Updates', 'Updates') },
    { id: 'help', icon: '❓', label: t('Hilfe', 'Help') },
];

/* ------------------------------------------------------------------ data */
async function getJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.json();
}

function subscribe() {
    try {
        const es = new EventSource('/api/stream');
        es.addEventListener('state', (e) => {
            STATE = JSON.parse(e.data);
            renderHeader();
            if (['overview', 'diagnostics'].includes(CURRENT_TAB)) render();
        });
        es.onerror = () => {
            /* EventSource auto-reconnects; fall back to a poll meanwhile */
        };
    } catch (_) {
        setInterval(async () => {
            try {
                STATE = await getJSON('/api/state');
                renderHeader();
                render();
            } catch (_) {
                /* ignore */
            }
        }, 5000);
    }
}

/* update check (client-side, best effort, never blocks UI) */
function cmpSemver(a, b) {
    const pa = String(a).replace(/^v/, '').split('.').map(Number);
    const pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}
async function checkUpdate() {
    try {
        const owner = (window.GITHUB_URL || '').split('github.com/')[1];
        if (!owner) return;
        const res = await fetch(`https://api.github.com/repos/${owner}/releases/latest`);
        if (!res.ok) return;
        const data = await res.json();
        const latest = data.tag_name;
        const current = (STATE && STATE.version) || window.APP_VERSION;
        if (latest && cmpSemver(latest, current) > 0) {
            UPDATE_INFO = { available: true, latest };
            renderHeader();
            render();
        }
    } catch (_) {
        /* offline / rate limited: ignore */
    }
}

/* ------------------------------------------------------------------ header */
function renderHeader() {
    const v = (STATE && STATE.version) || window.APP_VERSION || '';
    const badge = document.getElementById('versionBadge');
    badge.textContent = 'v' + v;
    badge.classList.toggle('version-badge--update', UPDATE_INFO.available);
    badge.onclick = () => go('updates');

    const connChip = document.getElementById('connChip');
    const connText = document.getElementById('connText');
    if (!STATE) {
        connChip.className = 'chip';
        connText.textContent = '…';
    } else if (STATE.gardena.rateLimited) {
        connChip.className = 'chip chip--err';
        connText.textContent = t('Gardena: Limit', 'Gardena: rate limit');
    } else if (STATE.gardena.connected && STATE.hcu.connected) {
        connChip.className = 'chip chip--ok';
        connText.textContent = t('Verbunden', 'Connected');
    } else {
        connChip.className = 'chip chip--warn';
        connText.textContent = t('Teilweise', 'Partial');
    }

    document.getElementById('moduleNav').innerHTML = TABS()
        .map(
            (tab) =>
                `<button class="app__module ${tab.id === CURRENT_TAB ? 'app__module--active' : ''}" data-tab="${tab.id}"><span>${tab.icon}</span>${tab.label}</button>`,
        )
        .join('');
    document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));

    const banner = document.getElementById('updateBanner');
    if (UPDATE_INFO.available && !bannerDismissed) {
        banner.innerHTML = `<div class="update-banner"><span>${t('Neue Version verfügbar', 'New version available')}: <strong>${UPDATE_INFO.latest}</strong></span><a href="${window.GITHUB_URL}/releases/latest" target="_blank" rel="noopener"><button class="primary">${t('Zu den Releases', 'View releases')}</button></a><button data-dismiss>✕</button></div>`;
        banner.querySelector('[data-dismiss]').onclick = () => {
            bannerDismissed = true;
            banner.innerHTML = '';
        };
    } else {
        banner.innerHTML = '';
    }
}

function go(tab) {
    CURRENT_TAB = tab;
    location.hash = tab;
    renderHeader();
    render();
}

/* ------------------------------------------------------------------ views */
function panel(title, badge, intro, body) {
    return `<section class="module-panel">
        <div class="module-panel__head"><h1>${title}</h1>${badge ? `<span class="module-panel__badge">${badge}</span>` : ''}</div>
        ${intro ? `<p class="module-panel__intro">${intro}</p>` : ''}
        ${body}</section>`;
}

function statusChip(ok, okText, badText, warn) {
    const cls = ok ? 'chip--ok' : warn ? 'chip--warn' : 'chip--err';
    return `<span class="chip ${cls}"><span class="dot"></span>${ok ? okText : badText}</span>`;
}

function viewOverview() {
    if (!STATE) return `<div class="loading">${t('Lädt…', 'Loading…')}</div>`;
    const d = STATE.devices || [];
    const cards = d.length
        ? `<div class="table-wrap card"><table>
            <thead><tr>
                <th>${t('Gerät', 'Device')}</th><th>${t('Typ', 'Type')}</th>
                <th>${t('Temp', 'Temp')}</th><th>${t('Feuchte', 'Humidity')}</th>
                <th>${t('Helligkeit', 'Brightness')}</th><th>${t('Batterie', 'Battery')}</th>
                <th>${t('Status', 'Status')}</th>
            </tr></thead><tbody>
            ${d
                .map(
                    (x) => `<tr>
                <td>${x.name}</td>
                <td>${x.type}</td>
                <td>${x.temperature !== null ? fmtNum(x.temperature, 1) + ' °C' : '–'}</td>
                <td>${x.humidity !== null ? fmtNum(x.humidity) + ' %' : '–'}</td>
                <td>${luxCell(x)}</td>
                <td>${x.battery !== null ? fmtNum(x.battery) + ' %' : x.batteryState || '–'}</td>
                <td>${x.included ? `<span class="chip chip--ok"><span class="dot"></span>${t('Aktiv', 'Active')}</span>` : `<span class="chip chip--warn"><span class="dot"></span>${t('Nicht inkludiert', 'Not included')}</span>`}</td>
            </tr>`,
                )
                .join('')}
            </tbody></table></div>`
        : `<div class="card empty">${t('Noch keine Geräte. Starte in der HMIP-App die Gerätesuche, sobald das Plugin „verbunden“ zeigt.', 'No devices yet. Start the device search in the HMIP app once the plugin shows “connected”.')}</div>`;

    const badge = `${STATE.counts.included}/${STATE.counts.devices} ${t('aktiv', 'active')}`;
    return panel(
        t('Übersicht', 'Overview'),
        badge,
        t('Live-Zustand aller Gardena-Geräte, die diese Bridge an Homematic IP weitergibt.', 'Live state of all Gardena devices this bridge forwards to Homematic IP.'),
        cards,
    );
}

function luxCell(x) {
    if (x.luxRaw === null) return '–';
    const capped = x.luxRaw > 20000;
    const reported = fmtNum(x.luxReported) + ' lx';
    if (!capped) return reported;
    return `${reported} <span class="chip chip--warn" title="${t('Die HMIP-App kann über die Connect-API nur bis 20.000 lx anzeigen (Spec §6.7.15). Sensor misst', 'The HMIP app can only show up to 20,000 lx via the Connect API (spec §6.7.15). Sensor measures')}: ${fmtNum(x.luxRaw)} lx">${t('gedeckelt', 'capped')}</span>`;
}

function viewAppearance() {
    const cur = langPref();
    const seg = (val, label) =>
        `<button class="seg__btn ${cur === val ? 'seg__btn--active' : ''}" data-lang="${val}">${label}</button>`;
    const body = `<div class="grid">
        <div class="glass">
            <h2>${t('Sprache', 'Language')}</h2>
            <div class="seg">${seg('AUTO', 'AUTO')}${seg('de', 'Deutsch')}${seg('en', 'English')}</div>
            <p class="hint">${t('AUTO folgt der Browsersprache, Deutsch als Fallback. Wahl gilt pro Gerät.', 'AUTO follows the browser language, German as fallback. Stored per device.')}</p>
        </div>
        <div class="glass">
            <h2>${t('Darstellung', 'Appearance')}</h2>
            <p class="hint">${t('Hell/Dunkel folgt automatisch dem Systemthema deines Geräts (prefers-color-scheme).', 'Light/dark follows your device system theme automatically (prefers-color-scheme).')}</p>
        </div>
    </div>`;
    return panel(t('Darstellung & Sprache', 'Appearance & Language'), null, '', body);
}

function viewDiagnostics() {
    if (!STATE) return `<div class="loading">${t('Lädt…', 'Loading…')}</div>`;
    const g = STATE.gardena;
    const body = `<div class="grid">
        <div class="glass"><h2>${t('Verbindungen', 'Connections')}</h2>
            <div class="kv"><span>Homematic IP (HCU)</span>${statusChip(STATE.hcu.connected, t('verbunden', 'connected'), t('getrennt', 'disconnected'))}</div>
            <div class="kv"><span>Gardena API</span>${statusChip(g.connected, t('verbunden', 'connected'), g.rateLimited ? t('Rate-Limit', 'rate limited') : t('getrennt', 'disconnected'), g.rateLimited)}</div>
            <div class="kv"><span>${t('Zugangsdaten', 'Credentials')}</span>${statusChip(g.configured, t('gesetzt', 'set'), t('fehlen', 'missing'))}</div>
            ${g.lastError ? `<div class="kv"><span>${t('Letzter Fehler', 'Last error')}</span><span>${g.lastError}</span></div>` : ''}
        </div>
        <div class="glass"><h2>${t('Build', 'Build')}</h2>
            <div class="kv"><span>Plugin-ID</span><span>${STATE.pluginId}</span></div>
            <div class="kv"><span>Version</span><span>v${STATE.version}</span></div>
            <div class="kv"><span>Build</span><span>${STATE.buildId}</span></div>
            <div class="kv"><span>${t('Geräte', 'Devices')}</span><span>${STATE.counts.included}/${STATE.counts.devices}</span></div>
        </div>
    </div>`;
    return panel(
        t('Diagnose', 'Diagnostics'),
        STATE.gardena.connected ? t('OK', 'OK') : t('Achtung', 'Attention'),
        t('Verbindungsstatus zu HCU und Gardena. Bei Rate-Limit (HTTP 429) pausiert das Plugin automatisch und versucht es später erneut.', 'Connection status to HCU and Gardena. On a rate limit (HTTP 429) the plugin pauses automatically and retries later.'),
        body,
    );
}

let LOGS = [];
async function loadLogs() {
    try {
        const data = await getJSON('/api/logs');
        LOGS = data.lines || [];
    } catch (_) {
        LOGS = [];
    }
    if (CURRENT_TAB === 'logs') render();
}
function viewLogs() {
    const lines = LOGS.slice(-300)
        .map(
            (l) =>
                `<div class="log-line log-line--${l.level}">[${l.ts}] [${l.level.toUpperCase()}] ${escapeHtml(l.message)}</div>`,
        )
        .join('');
    const body = `<div class="card">
        <div class="row" style="margin-bottom:var(--sp-3)">
            <button data-reload>↻ ${t('Aktualisieren', 'Refresh')}</button>
            <button class="primary" data-export>📦 ${t('Alle Informationen', 'All information')}</button>
            <span class="hint">${t('Der Export sammelt alle /api/-Antworten + Browser-Infos in einer .txt-Datei.', 'The export collects all /api responses + browser info into one .txt file.')}</span>
        </div>
        <pre class="logs">${lines || t('Keine Logs.', 'No logs.')}</pre>
    </div>`;
    return panel(t('Logs & Debug', 'Logs & Debug'), `${LOGS.length} ${t('Zeilen', 'lines')}`, '', body);
}

function viewUpdates() {
    const cur = (STATE && STATE.version) || window.APP_VERSION;
    const body = `<div class="grid">
        <div class="glass"><h2>${t('Version', 'Version')}</h2>
            <div class="metric">v${cur}</div>
            <p class="hint">${UPDATE_INFO.available ? `${t('Verfügbar', 'Available')}: ${UPDATE_INFO.latest}` : t('Aktuell auf dem neuesten Stand (oder Prüfung offline).', 'Up to date (or check offline).')}</p>
            <div class="row" style="margin-top:var(--sp-3)">
                <a href="${window.GITHUB_URL}/releases/latest" target="_blank" rel="noopener"><button class="primary">${t('Releases öffnen', 'Open releases')}</button></a>
                <a href="${window.GITHUB_URL}" target="_blank" rel="noopener"><button>GitHub</button></a>
            </div>
        </div>
        <div class="glass"><h2>${t('So aktualisierst du', 'How to update')}</h2>
            <ol style="margin:0;padding-left:1.2em;color:var(--color-muted)">
                <li>${t('Neueste .tar.gz aus den GitHub-Releases laden.', 'Download the latest .tar.gz from GitHub releases.')}</li>
                <li>${t('In HCUweb unter Plugins hochladen.', 'Upload it in HCUweb under Plugins.')}</li>
                <li>${t('Die HCU hat keinen Auto-Updater – Updates sind manuell.', 'The HCU has no auto-updater – updates are manual.')}</li>
            </ol>
        </div>
        <div class="glass"><h2>Changelog</h2>
            <div class="help-item"><h3>1.2.0</h3><p>${t('Dashboard (Port 8093), robuster Gardena-Reconnect mit Backoff + 429-Cooldown, Lux-Hinweis.', 'Dashboard (port 8093), robust Gardena reconnect with backoff + 429 cooldown, lux note.')}</p></div>
            <div class="help-item"><h3>1.1.x</h3><p>${t('Icon, README-Politur, Metadaten.', 'Icon, README polish, metadata.')}</p></div>
        </div>
    </div>`;
    return panel(t('Updates', 'Updates'), null, '', body);
}

function viewHelp() {
    const items = [
        [t('Geräte einbinden', 'Add devices'), t('Trage in HCUweb deine Husqvarna-Developer-Zugangsdaten ein. Wenn das Plugin „verbunden“ zeigt, starte in der HMIP-App die Gerätesuche.', 'Enter your Husqvarna developer credentials in HCUweb. Once the plugin shows “connected”, start the device search in the HMIP app.')],
        [t('Helligkeit max. 20.000 lx', 'Brightness max 20,000 lx'), t('Die Connect-API begrenzt den Helligkeitswert auf 20.000 lx (Spec §6.7.15). Höhere Sensorwerte kann die HMIP-App nicht darstellen – das ist eine API-Grenze, kein Plugin-Fehler.', 'The Connect API caps brightness at 20,000 lx (spec §6.7.15). The HMIP app cannot display higher sensor values – this is an API limit, not a plugin bug.')],
        [t('Gardena Rate-Limit', 'Gardena rate limit'), t('Die Husqvarna-API erlaubt nur wenige Anfragen. Bei einem Limit (HTTP 429) pausiert das Plugin automatisch ~1 Stunde und verbindet sich danach erneut, statt das Limit weiter zu reizen.', 'The Husqvarna API allows only few requests. On a limit (HTTP 429) the plugin auto-pauses for ~1 hour and reconnects afterwards instead of hammering the limit.')],
        [t('Diagnose & Logs', 'Diagnostics & logs'), t('Unter Diagnose siehst du den Verbindungsstatus, unter Logs & Debug die letzten Ereignisse und den 360°-Export.', 'Diagnostics shows the connection status; Logs & Debug shows recent events and the 360° export.')],
    ];
    const body = `<div class="card">${items.map(([h, p]) => `<div class="help-item"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div>`;
    return panel(t('Hilfe', 'Help'), null, t('Kompakter Funktionsüberblick.', 'A compact feature overview.'), body);
}

/* ------------------------------------------------------------------ 360° export */
async function exportAll() {
    const parts = [];
    parts.push('=== HMIP Gardena Plugin – 360° Export ===');
    parts.push('Generated: ' + new Date().toISOString());
    parts.push('User-Agent: ' + navigator.userAgent);
    parts.push('Language: ' + navigator.language + ' (pref ' + langPref() + ')');
    parts.push('Screen: ' + window.screen.width + 'x' + window.screen.height);
    parts.push('');
    for (const ep of ['state', 'config', 'diagnostics', 'metrics', 'logs']) {
        parts.push('=== /api/' + ep + ' ===');
        try {
            parts.push(JSON.stringify(await getJSON('/api/' + ep), null, 2));
        } catch (e) {
            parts.push('ERROR: ' + e.message);
        }
        parts.push('');
    }
    const blob = new Blob([parts.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gardena-plugin-export-' + Date.now() + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

/* ------------------------------------------------------------------ render */
function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function render() {
    const view = document.getElementById('view');
    let html = '';
    switch (CURRENT_TAB) {
        case 'appearance': html = viewAppearance(); break;
        case 'diagnostics': html = viewDiagnostics(); break;
        case 'logs': html = viewLogs(); break;
        case 'updates': html = viewUpdates(); break;
        case 'help': html = viewHelp(); break;
        default: html = viewOverview();
    }
    view.innerHTML = html;

    view.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => setLang(b.dataset.lang)));
    const reload = view.querySelector('[data-reload]');
    if (reload) reload.onclick = loadLogs;
    const exp = view.querySelector('[data-export]');
    if (exp) exp.onclick = exportAll;
    if (CURRENT_TAB === 'logs' && !LOGS.length) loadLogs();
}

/* ------------------------------------------------------------------ boot */
async function boot() {
    document.documentElement.lang = activeLang();
    renderHeader();
    render();
    try {
        STATE = await getJSON('/api/state');
    } catch (_) {
        /* server may still be warming up */
    }
    renderHeader();
    render();
    subscribe();
    checkUpdate();
    setInterval(checkUpdate, 3 * 60 * 60 * 1000);
}
window.addEventListener('hashchange', () => {
    CURRENT_TAB = location.hash.replace('#', '') || 'overview';
    renderHeader();
    render();
});
boot();
