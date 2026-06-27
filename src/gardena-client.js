'use strict';

/**
 * Gardena smart system API v2 client.
 *
 * Flow:
 *   1. POST {authBase}/v1/oauth2/token (grant_type=client_credentials)
 *      -> access_token (1h TTL) + Husqvarna-specific claims
 *   2. GET  {apiBase}/v1/locations                   -> pick location (or use configured id)
 *   3. GET  {apiBase}/v1/locations/{locId}           -> initial snapshot of all devices/services
 *   4. POST {apiBase}/v1/websocket with {locationId} -> returns a signed wss URL + TTL
 *   5. Connect to that wss URL; the server pushes JSON-API messages:
 *        { id, type: "LOCATION"|"DEVICE"|"MOWER"|"VALVE"|..., attributes: {...} }
 *      Control: POST {apiBase}/v1/command/{serviceId} with a command envelope.
 *
 * Rate limit: Gardena caps REST at ~700 requests/week. We lean entirely on
 * the websocket for live state and only call REST for token refresh and
 * re-discovery on (re)connect.
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');

const logger = require('./logger');
const { gardena: cfg } = require('./config');

const TOKEN_EARLY_REFRESH_MS = 60 * 1000;

class GardenaClient extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.locationId = cfg.locationId || '';
        // Services are the controllable entities (MOWER, VALVE, POWER_SOCKET,
        // SENSOR). Devices are the physical chassis carrying one or more
        // services. We expose services upwards, decorated with owner info.
        this.services = new Map(); // serviceId -> { id, type, name, deviceId, state }
        this.devices = new Map(); // deviceId -> { id, modelType, name, batteryLevel }
        this._token = null;
        this._tokenRefreshTimer = null;
        this._ws = null;
        this._wsPingTimer = null;
        this._reconnectTimer = null;
        this._stopping = false;
        // Reconnect/back-off bookkeeping. `_reconnectAttempts` drives the
        // exponential back-off; `_rateLimitedUntil` is a wall-clock deadline we
        // must not retry before after an HTTP 429; `_lastSnapshotAt` lets us
        // skip redundant REST snapshot reloads on routine websocket reconnects.
        this._reconnectAttempts = 0;
        this._rateLimitedUntil = 0;
        this._lastSnapshotAt = 0;
        // Last human-readable failure reason (for diagnostics / logs).
        this.lastError = null;
    }

    /** True while we are deliberately backing off after a 429 rate limit. */
    get rateLimited() {
        return Date.now() < this._rateLimitedUntil;
    }

    async start() {
        this._stopping = false;
        await this._connect();
    }

    async stop() {
        this._stopping = true;
        if (this._tokenRefreshTimer) clearTimeout(this._tokenRefreshTimer);
        if (this._wsPingTimer) clearInterval(this._wsPingTimer);
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        if (this._ws) this._ws.close();
        this.connected = false;
    }

    async _connect() {
        if (!cfg.clientId || !cfg.clientSecret) {
            logger.warn('Gardena client id/secret missing, waiting for config.');
            return;
        }
        try {
            await this._ensureToken();
            if (!this.locationId) {
                this.locationId = await this._pickLocation();
            }
            // Skip the REST snapshot on routine reconnects: the websocket
            // replays full entity states on change anyway, and avoiding the
            // extra GET keeps us under the Gardena rate limit.
            const snapshotStale =
                this.services.size === 0 ||
                Date.now() - this._lastSnapshotAt > cfg.snapshotMaxAgeMs;
            if (snapshotStale) {
                await this._loadLocationSnapshot();
                this._lastSnapshotAt = Date.now();
            }
            await this._openWebsocket();
            this.connected = true;
            // A clean connect clears the back-off and error state.
            this._reconnectAttempts = 0;
            this.lastError = null;
            this.emit('ready');
        } catch (err) {
            if (err && err.status === 429) {
                this._rateLimitedUntil = Date.now() + cfg.rateLimitCooldownMs;
                this.lastError = 'Gardena API rate limit reached (HTTP 429).';
                logger.error(
                    `Gardena rate limit hit (429); backing off for ${Math.round(
                        cfg.rateLimitCooldownMs / 60000,
                    )} min before retrying.`,
                );
            } else {
                this.lastError = err && err.message ? err.message : String(err);
                logger.error('Gardena connect failed:', this.lastError);
            }
            this._scheduleReconnect();
        }
    }

    _scheduleReconnect() {
        if (this._stopping || this._reconnectTimer) return;
        const now = Date.now();
        let delay;
        if (this._rateLimitedUntil > now) {
            // Honour the 429 cooldown deadline exactly.
            delay = this._rateLimitedUntil - now;
        } else {
            // Exponential back-off capped at maxReconnectDelayMs, with jitter in
            // [delay/2, delay] to avoid synchronised reconnect storms.
            const capped = Math.min(
                cfg.maxReconnectDelayMs,
                cfg.reconnectDelayMs * 2 ** this._reconnectAttempts,
            );
            delay = capped / 2 + Math.random() * (capped / 2);
            this._reconnectAttempts += 1;
        }
        logger.info(`Gardena reconnect scheduled in ${Math.round(delay / 1000)}s`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._connect();
        }, delay);
    }

    // --- OAuth -------------------------------------------------------------

    async _ensureToken() {
        const now = Date.now();
        if (this._token && this._token.expiresAt - now > TOKEN_EARLY_REFRESH_MS) return;
        logger.info('Requesting new Gardena access token');
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
        });
        const res = await fetch(`${cfg.authBase}/v1/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!res.ok) {
            throw new Error(`OAuth token request failed (${res.status}): ${await res.text()}`);
        }
        const data = await res.json();
        this._token = {
            accessToken: data.access_token,
            expiresAt: now + (data.expires_in || 3600) * 1000,
        };
        const refreshInMs = Math.max(
            TOKEN_EARLY_REFRESH_MS,
            this._token.expiresAt - Date.now() - TOKEN_EARLY_REFRESH_MS,
        );
        if (this._tokenRefreshTimer) clearTimeout(this._tokenRefreshTimer);
        this._tokenRefreshTimer = setTimeout(
            () => this._ensureToken().catch((e) => logger.warn('Token refresh failed:', e.message)),
            refreshInMs,
        );
    }

    _apiHeaders() {
        return {
            Authorization: `Bearer ${this._token.accessToken}`,
            'Authorization-Provider': 'husqvarna',
            'X-Api-Key': cfg.clientId,
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
        };
    }

    async _apiGet(path) {
        await this._ensureToken();
        const res = await fetch(`${cfg.apiBase}${path}`, { headers: this._apiHeaders() });
        if (!res.ok) throw await this._httpError('GET', path, res);
        return res.json();
    }

    async _apiPut(path, body) {
        await this._ensureToken();
        const res = await fetch(`${cfg.apiBase}${path}`, {
            method: 'PUT',
            headers: this._apiHeaders(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw await this._httpError('PUT', path, res);
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    }

    async _apiPost(path, body) {
        await this._ensureToken();
        const res = await fetch(`${cfg.apiBase}${path}`, {
            method: 'POST',
            headers: this._apiHeaders(),
            body: JSON.stringify(body),
        });
        if (!res.ok) throw await this._httpError('POST', path, res);
        // 202 Accepted for commands returns no body
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    }

    /**
     * Build an Error from a failed fetch Response and tag it with the HTTP
     * status so callers can special-case 429 (rate limit) back-off.
     */
    async _httpError(method, path, res) {
        const text = await res.text().catch(() => '');
        const err = new Error(`${method} ${path} failed (${res.status}): ${text}`);
        err.status = res.status;
        return err;
    }

    // --- Discovery ---------------------------------------------------------

    async _pickLocation() {
        const data = await this._apiGet('/v1/locations');
        if (!data.data || !data.data.length) throw new Error('Gardena account has no locations');
        const first = data.data[0];
        logger.info(`Using Gardena location ${first.id} (${first.attributes?.name || ''})`);
        return first.id;
    }

    async _loadLocationSnapshot() {
        const data = await this._apiGet(`/v1/locations/${this.locationId}`);
        this.services.clear();
        this.devices.clear();
        // Suppress `serviceChanged` emission during the initial ingest so the
        // HCU-facing plugin doesn't fire STATUS_EVENTs before receiving the
        // InclusionEvent (which would trigger "Device not found").
        this._suppressEmit = true;
        try {
            for (const item of data.included || []) {
                this._ingestEntity(item);
            }
        } finally {
            this._suppressEmit = false;
        }
        logger.info(
            `Gardena snapshot: ${this.devices.size} device(s), ${this.services.size} service(s)`,
        );
    }

    _ingestEntity(entity) {
        if (!entity || !entity.id || !entity.type) return;
        const type = entity.type;
        const attrs = this._flattenAttributes(entity.attributes || {});

        if (type === 'LOCATION') {
            return; // not exposed
        }

        if (type === 'DEVICE') {
            const existing = this.devices.get(entity.id) || { id: entity.id };
            this.devices.set(entity.id, {
                ...existing,
                id: entity.id,
                modelType: attrs.modelType || existing.modelType || '',
                name: attrs.name || existing.name || `Gardena ${entity.id}`,
            });
            return;
        }

        // COMMON service carries battery / rfLink info for its parent device.
        // Fold those into the device record so sibling actuator services can
        // report battery in their HMIP device status.
        if (type === 'COMMON') {
            const ownerId = this._ownerDeviceId(entity);
            if (!ownerId) return;
            const existing = this.devices.get(ownerId) || { id: ownerId };
            const updated = { ...existing, id: ownerId };
            if (attrs.name) updated.name = attrs.name;
            if (attrs.modelType) updated.modelType = attrs.modelType;
            if (typeof attrs.batteryLevel === 'number') updated.batteryLevel = attrs.batteryLevel;
            if (attrs.batteryState) updated.batteryState = attrs.batteryState;
            if (typeof attrs.rfLinkLevel === 'number') updated.rfLinkLevel = attrs.rfLinkLevel;
            if (attrs.rfLinkState) updated.rfLinkState = attrs.rfLinkState;
            if (attrs.serial) updated.serial = attrs.serial;
            this.devices.set(ownerId, updated);
            // Re-emit sibling services so consumers see the refreshed battery.
            if (!this._suppressEmit) {
                for (const svc of this.services.values()) {
                    if (svc.deviceId === ownerId) this.emit('serviceChanged', svc);
                }
            }
            return;
        }

        // Everything else is a controllable / sensor service.
        const service = this.services.get(entity.id) || {
            id: entity.id,
            type,
            deviceId: this._ownerDeviceId(entity),
        };
        service.type = type;
        service.name =
            attrs.name ||
            service.name ||
            (service.deviceId && this.devices.get(service.deviceId)?.name) ||
            `${type} ${entity.id.slice(0, 6)}`;
        service.state = { ...(service.state || {}), ...attrs };
        this.services.set(entity.id, service);
        if (!this._suppressEmit) this.emit('serviceChanged', service);
    }

    _ownerDeviceId(entity) {
        const rel = entity.relationships?.device?.data;
        return rel?.id || '';
    }

    /**
     * Gardena's JSON API wraps every attribute in { value, timestamp }.
     * We flatten to { key: value } for ergonomics.
     */
    _flattenAttributes(raw) {
        const out = {};
        for (const [key, wrapped] of Object.entries(raw)) {
            if (wrapped && typeof wrapped === 'object' && 'value' in wrapped) {
                out[key] = wrapped.value;
            } else {
                out[key] = wrapped;
            }
        }
        return out;
    }

    // --- WebSocket ---------------------------------------------------------

    async _openWebsocket() {
        const resp = await this._apiPost('/v1/websocket', {
            data: {
                type: 'WEBSOCKET',
                attributes: { locationId: this.locationId },
                id: 'request-1',
            },
        });
        const url = resp?.data?.attributes?.url;
        if (!url) throw new Error('Gardena websocket response missing url');
        logger.info('Opening Gardena websocket');

        const ws = new WebSocket(url);
        this._ws = ws;

        ws.on('open', () => {
            logger.info('Gardena websocket open');
            this._wsPingTimer = setInterval(() => {
                try {
                    ws.ping();
                } catch (e) {
                    logger.debug('ws.ping threw:', e.message);
                }
            }, cfg.websocketPingIntervalMs);
        });

        ws.on('message', (raw) => this._onWsMessage(raw));
        ws.on('close', (code, reason) => {
            logger.warn(`Gardena websocket closed (${code} ${String(reason || '')})`);
            if (this._wsPingTimer) clearInterval(this._wsPingTimer);
            this._wsPingTimer = null;
            this._ws = null;
            this.connected = false;
            if (!this._stopping) this._scheduleReconnect();
        });
        ws.on('error', (err) =>
            logger.warn('Gardena ws error:', err && err.message ? err.message : err),
        );
    }

    _onWsMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw.toString('utf8'));
        } catch (err) {
            logger.warn('Non-JSON ws message from Gardena:', err.message);
            return;
        }
        // Server pushes single entities in the same shape as REST `included`.
        this._ingestEntity(msg);
    }

    // --- Commands ----------------------------------------------------------

    /**
     * Send a control command to a specific service. The body shape depends on
     * the service type; the HCU-facing code knows the mapping.
     */
    async command(serviceId, commandBody) {
        // The Gardena v2 API expects PUT on /command endpoints; using POST
        // triggers a 403 with "Invalid key=value pair in Authorization
        // header" from the API gateway's WAF. Reference: the hass-gardena-
        // smart-system implementation uses PUT as well. Service IDs pass
        // through unescaped, including the colon used by multi-valve
        // irrigation controllers (`{uuid}:N`).
        await this._apiPut(`/v1/command/${serviceId}`, commandBody);
    }

    listServices() {
        return Array.from(this.services.values());
    }

    getService(id) {
        return this.services.get(id);
    }

    getDevice(id) {
        return this.devices.get(id);
    }
}

module.exports = { GardenaClient };
