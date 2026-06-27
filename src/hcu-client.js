'use strict';

/**
 * WebSocket client to the Homematic IP HCU Connect API (v1.0.1).
 * Identical to the one used by the Velux plugin; kept in this repo so both
 * plugins can evolve independently.
 */

const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');

const logger = require('./logger');
const { hcu, pluginId } = require('./config');

class HcuClient extends EventEmitter {
    constructor() {
        super();
        this._ws = null;
        this._reconnectTimer = null;
        this._stopping = false;
        this._handlers = new Map();
    }

    on(type, handler) {
        if (typeof type === 'string' && type === type.toUpperCase() && type.includes('_')) {
            this._handlers.set(type, handler);
            return this;
        }
        return super.on(type, handler);
    }

    start() {
        this._stopping = false;
        this._connect();
    }

    /** True while the HCU websocket is open and ready to send. */
    get connected() {
        return Boolean(this._ws && this._ws.readyState === WebSocket.OPEN);
    }

    stop() {
        this._stopping = true;
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        if (this._ws) this._ws.close();
    }

    _connect() {
        if (!hcu.authToken) {
            logger.error('No HCU auth token available (neither /TOKEN nor HMIP_HCU_AUTH_TOKEN).');
            this._reconnectTimer = setTimeout(() => this._connect(), hcu.reconnectDelayMs);
            return;
        }

        const url = `wss://${hcu.host}:${hcu.port}`;
        logger.info(`Connecting to HCU Connect API at ${url}`);
        const ws = new WebSocket(url, {
            headers: {
                authtoken: hcu.authToken,
                'plugin-id': pluginId,
            },
            rejectUnauthorized: false,
        });

        ws.on('open', () => {
            logger.info('HCU WebSocket open');
            this._ws = ws;
            this.emit('open');
            this.sendPluginState('READY');
        });
        ws.on('message', (raw) => this._onMessage(raw));
        ws.on('close', (code, reason) => this._onClose(code, reason));
        ws.on('error', (err) =>
            logger.warn('HCU ws error:', err && err.message ? err.message : err),
        );
    }

    _onClose(code, reason) {
        logger.warn(
            `HCU ws closed (${code} ${String(reason || '')}), reconnecting in ${hcu.reconnectDelayMs}ms`,
        );
        this._ws = null;
        this.emit('close');
        if (this._stopping) return;
        this._reconnectTimer = setTimeout(() => this._connect(), hcu.reconnectDelayMs);
    }

    _onMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw.toString('utf8'));
        } catch (err) {
            logger.warn('Ignoring non-JSON message from HCU:', err.message);
            return;
        }
        logger.debug('HCU ->', msg.type, msg.id);
        const handler = this._handlers.get(msg.type);
        if (!handler) return;
        Promise.resolve()
            .then(() => handler(msg.body || {}, msg))
            .catch((err) => logger.error(`Handler for ${msg.type} threw:`, err));
    }

    send(type, body, idOrEnvelope) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            logger.warn(`Cannot send ${type}, socket not ready`);
            return;
        }
        const id =
            typeof idOrEnvelope === 'string'
                ? idOrEnvelope
                : (idOrEnvelope && idOrEnvelope.id) || randomUUID();
        const envelope = { pluginId, id, type, body: body || {} };
        logger.debug('HCU <-', type, id);
        this._ws.send(JSON.stringify(envelope));
    }

    sendPluginState(pluginReadinessStatus, error) {
        this.send('PLUGIN_STATE_RESPONSE', {
            pluginReadinessStatus,
            ...(error ? { error } : {}),
        });
    }
}

module.exports = { HcuClient };
