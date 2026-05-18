'use strict';

/**
 * Bridge between the Homematic IP HCU Connect API and the Gardena smart
 * system API v2. Same message flow as the Velux plugin; see its plugin.js
 * for the ASCII sequence diagram.
 */

const logger = require('./logger');
const { HcuClient } = require('./hcu-client');
const { GardenaClient } = require('./gardena-client');
const {
    toDevice,
    toStatus,
    toStatusEvent,
    parseDeviceId,
    isExposable,
    controlToGardenaCommand,
} = require('./device-mapper');
const cfg = require('./config');

class GardenaPlugin {
    constructor() {
        this.hcu = new HcuClient();
        this.gardena = new GardenaClient();
        this.includedDevices = new Set();
    }

    async start() {
        this._wireGardena();
        this._wireHcu();
        this.hcu.start();
        this.gardena.start().catch((err) => logger.error('Gardena start failed:', err));
    }

    async stop() {
        this.hcu.stop();
        await this.gardena.stop();
    }

    _wireGardena() {
        this.gardena.on('ready', () => {
            logger.info(`Gardena ready with ${this.gardena.listServices().length} service(s)`);
            // Don't push statuses here; wait for the HCU to send DiscoverRequest
            // and then InclusionEvent. Sending statuses before inclusion
            // triggers "Device not found" errors from the HCU.
            this.hcu.sendPluginState(this._readiness());
        });
        this.gardena.on('serviceChanged', (service) => this._emitStatusEvent(service));
    }

    _wireHcu() {
        this.hcu.on('open', () => logger.info(`Plugin ${cfg.pluginId} connected to HCU.`));

        this.hcu.on('PLUGIN_STATE_REQUEST', (_body, env) => {
            this.hcu.send(
                'PLUGIN_STATE_RESPONSE',
                { pluginReadinessStatus: this._readiness() },
                env,
            );
        });

        this.hcu.on('DISCOVER_REQUEST', (_body, env) => {
            const devices = this._exposedServices().map((svc) =>
                toDevice(svc, this.gardena.getDevice(svc.deviceId)),
            );
            this.hcu.send('DISCOVER_RESPONSE', { devices, success: true }, env);
        });

        this.hcu.on('INCLUSION_EVENT', (body) => {
            const ids = body.deviceIds || [];
            ids.forEach((id) => this.includedDevices.add(id));
            logger.info(`HCU included ${ids.length} device(s); total ${this.includedDevices.size}`);
            this._pushAllStatuses();
        });

        this.hcu.on('EXCLUSION_EVENT', (body) => {
            (body.deviceIds || []).forEach((id) => this.includedDevices.delete(id));
        });

        this.hcu.on('STATUS_REQUEST', (body, env) => {
            const wanted = new Set(body.deviceIds || []);
            const devices = this._exposedServices()
                .map((svc) => toStatus(svc, this.gardena.getDevice(svc.deviceId)))
                .filter((s) => wanted.size === 0 || wanted.has(s.deviceId));
            this.hcu.send('STATUS_RESPONSE', { devices, success: true }, env);
        });

        this.hcu.on('CONTROL_REQUEST', (body, env) => this._handleControl(body, env));

        this.hcu.on('CONFIG_TEMPLATE_REQUEST', (body, env) => this._sendConfigTemplate(body, env));
        this.hcu.on('CONFIG_UPDATE_REQUEST', (body, env) => this._handleConfigUpdate(body, env));

        this.hcu.on('ERROR_RESPONSE', (body) => logger.warn('HCU ERROR_RESPONSE:', body));
    }

    _exposedServices() {
        return this.gardena.listServices().filter(isExposable);
    }

    _readiness() {
        if (!cfg.gardena.clientId || !cfg.gardena.clientSecret) return 'CONFIG_REQUIRED';
        // The HCU only accepts READY | CONFIG_REQUIRED | ERROR. Anything else
        // is rejected with a Jackson enum-deserialization error.
        if (!this.gardena.connected) return 'ERROR';
        return 'READY';
    }

    _pushAllStatuses() {
        const statuses = this._exposedServices()
            .map((svc) => toStatus(svc, this.gardena.getDevice(svc.deviceId)))
            .filter((s) => this.includedDevices.size === 0 || this.includedDevices.has(s.deviceId));
        if (statuses.length) this.hcu.send('STATUS_RESPONSE', { devices: statuses, success: true });
    }

    _emitStatusEvent(service) {
        if (!isExposable(service)) return;
        const event = toStatusEvent(service, this.gardena.getDevice(service.deviceId));
        // Hard gate: only send STATUS_EVENTs for devices the HCU has explicitly
        // included. Sending early (e.g. during the initial snapshot ingestion)
        // causes "Device not found" errors because the HCU hasn't registered
        // them yet.
        if (!this.includedDevices.has(event.deviceId)) return;
        this.hcu.send('STATUS_EVENT', event);
    }

    async _handleControl(body, env) {
        const { deviceId, features, path } = body;
        const serviceId = parseDeviceId(deviceId);
        const service = serviceId && this.gardena.getService(serviceId);
        if (!service) {
            return this._controlError(env, deviceId, 404, 'UNKNOWN_DEVICE', `Unknown device ${deviceId}`);
        }
        const cmd = controlToGardenaCommand(service, features, path);
        if (!cmd) {
            return this._controlError(env, deviceId, 400, 'INVALID_REQUEST', 'Unsupported command payload');
        }
        try {
            await this.gardena.command(service.id, cmd);
            // Connect API requires `deviceId` on every CONTROL_RESPONSE.
            this.hcu.send('CONTROL_RESPONSE', { deviceId, code: 200, success: true }, env);
        } catch (err) {
            logger.error(`Control failed for ${deviceId}:`, err);
            this._controlError(env, deviceId, 500, 'INTERNAL_ERROR', err.message || 'unknown');
        }
    }

    _controlError(env, deviceId, code, key, message) {
        this.hcu.send(
            'CONTROL_RESPONSE',
            { deviceId, code, success: false, error: { code, key, message } },
            env,
        );
    }

    _sendConfigTemplate(body, env) {
        // Connect API 6.3.1 / 6.5.4: properties is a Map<id, PropertyTemplate>,
        // NOT an array. HCUweb uses this map to render a localized form.
        const lang = (body && body.languageCode) || 'de';
        const de = lang.startsWith('de');

        this.hcu.send(
            'CONFIG_TEMPLATE_RESPONSE',
            {
                groups: {
                    credentials: {
                        friendlyName: de ? 'Husqvarna Developer Account' : 'Husqvarna Developer Account',
                        description: de
                            ? 'Zugangsdaten aus developer.husqvarnagroup.cloud. Die App muss mit der Authentication API UND der GARDENA smart system API verbunden sein.'
                            : 'Credentials from developer.husqvarnagroup.cloud. Your application must have both the Authentication API and the GARDENA smart system API connected.',
                        order: 10,
                    },
                    options: {
                        friendlyName: de ? 'Optionen' : 'Options',
                        description: de
                            ? 'Zusätzliche Einstellungen. Leerlassen für Standardwerte.'
                            : 'Additional settings. Leave empty for defaults.',
                        order: 20,
                    },
                },
                properties: {
                    GARDENA_CLIENT_ID: {
                        dataType: 'STRING',
                        friendlyName: de ? 'Application Key (Client ID)' : 'Application Key (Client ID)',
                        description: de
                            ? 'Der "Application Key" aus deiner Husqvarna-Developer-App.'
                            : 'The "Application Key" from your Husqvarna developer application.',
                        groupId: 'credentials',
                        currentValue: cfg.gardena.clientId,
                        required: true,
                        minimumLength: 10,
                        maximumLength: 128,
                        order: 1,
                    },
                    GARDENA_CLIENT_SECRET: {
                        dataType: 'PASSWORD',
                        friendlyName: de ? 'Application Secret' : 'Application Secret',
                        description: de
                            ? 'Das "Application Secret" deiner Husqvarna-Developer-App.'
                            : 'The "Application Secret" of your Husqvarna developer application.',
                        groupId: 'credentials',
                        required: true,
                        minimumLength: 10,
                        maximumLength: 256,
                        order: 2,
                    },
                    GARDENA_LOCATION_ID: {
                        dataType: 'STRING',
                        friendlyName: de ? 'Location ID (optional)' : 'Location ID (optional)',
                        description: de
                            ? 'Nur nötig, wenn dein Konto mehrere Standorte hat. Sonst leer lassen.'
                            : 'Only needed if your account has more than one location. Leave empty otherwise.',
                        groupId: 'options',
                        currentValue: cfg.gardena.locationId,
                        required: false,
                        maximumLength: 64,
                        order: 1,
                    },
                    GARDENA_VALVE_DURATION_SEC: {
                        dataType: 'NUMBER',
                        friendlyName: de ? 'Ventil-Laufzeit (Sekunden)' : 'Valve run time (seconds)',
                        description: de
                            ? 'Dauer für Ventil "einschalten" aus der HMIP-App.'
                            : 'Duration for "turn on valve" commands from the HMIP app.',
                        groupId: 'options',
                        currentValue: cfg.gardena.defaultValveDurationSec,
                        defaultValue: 1800,
                        minimum: 60,
                        maximum: 14400,
                        order: 2,
                    },
                },
            },
            env,
        );
    }

    async _handleConfigUpdate(body, env) {
        try {
            // ConfigUpdateRequest body is { properties: Map<id, value> }.
            const updates = body.properties || {};
            cfg.applyUpdate(updates);

            this.hcu.send(
                'CONFIG_UPDATE_RESPONSE',
                {
                    status: 'APPLIED',
                    message: 'Konfiguration gespeichert. Plugin verbindet sich neu mit Gardena.',
                },
                env,
            );

            // Reconnect Gardena with the new credentials.
            await this.gardena.stop();
            this.gardena = new GardenaClient();
            this._wireGardena();
            await this.gardena.start();
            this.hcu.sendPluginState(this._readiness());
        } catch (err) {
            logger.error('Config update failed:', err);
            this.hcu.send(
                'CONFIG_UPDATE_RESPONSE',
                { status: 'FAILED', message: err.message || 'Unbekannter Fehler' },
                env,
            );
        }
    }
}

module.exports = { GardenaPlugin };
