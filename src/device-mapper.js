'use strict';

/**
 * Map Gardena services into HMIP Connect API Device objects + FeatureStates.
 *
 * HMIP archetypes used (Connect API 6.6.5 DeviceType):
 *   - SWITCH          -> required: SwitchState;  optional: OnTime, Maintenance
 *   - CLIMATE_SENSOR  -> optional: ActualTemperature, Humidity, Illumination,
 *                        Raining, Sunshine, ... (no required features)
 *   - BATTERY feature   -> included on devices that report battery
 *
 * Gardena service types (per Jeedom + hass-gardena-smart-system):
 *   - COMMON         -> meta-service carrying battery/rfLink info for parent
 *   - MOWER          -> Sileno mower
 *   - VALVE          -> Water Control + Irrigation (1..6 valves)
 *   - POWER_SOCKET   -> Smart Power
 *   - SENSOR         -> Smart Sensor (temperature, humidity, light)
 *
 * Command mapping (Gardena v2 command body shapes are spec-confirmed against
 * py-smart-gardena/hass-gardena-smart-system):
 *   POWER_SOCKET on  -> {type:'POWER_SOCKET_CONTROL', command:'START_OVERRIDE'}
 *   POWER_SOCKET off -> {type:'POWER_SOCKET_CONTROL', command:'STOP_UNTIL_NEXT_TASK'}
 *   VALVE on         -> {type:'VALVE_CONTROL', command:'START_SECONDS_TO_OVERRIDE', seconds}
 *   VALVE off        -> {type:'VALVE_CONTROL', command:'STOP_UNTIL_NEXT_TASK'}
 *   MOWER on         -> {type:'MOWER_CONTROL', command:'START_DONT_OVERRIDE'}
 *   MOWER off        -> {type:'MOWER_CONTROL', command:'PARK_UNTIL_NEXT_TASK'}
 */

const cfg = require('./config');
const { pluginId } = cfg;

// Exposable to HMIP (COMMON is merged into siblings, not exposed directly).
const EXPOSABLE_TYPES = new Set(['MOWER', 'VALVE', 'POWER_SOCKET', 'SENSOR']);

// Gardena activity enums that the Jeedom doc lists as "active/on".
const POWER_SOCKET_ON = new Set(['FOREVER_ON', 'TIME_LIMITED_ON', 'SCHEDULED_ON']);
const VALVE_WATERING = new Set(['MANUAL_WATERING', 'SCHEDULED_WATERING']);
const MOWER_ACTIVE = new Set([
    'OK_CUTTING',
    'OK_CUTTING_TIMER_OVERRIDDEN',
    'OK_SEARCHING',
    'OK_LEAVING',
    'OK_CHARGING',
]);

function deviceIdFor(serviceId) {
    return `${pluginId}:gardena:${serviceId}`;
}

function parseDeviceId(deviceId) {
    const prefix = `${pluginId}:gardena:`;
    if (!deviceId || !deviceId.startsWith(prefix)) return null;
    return deviceId.slice(prefix.length);
}

function isExposable(service) {
    return EXPOSABLE_TYPES.has(service.type);
}

function labelFor(service, owner) {
    const base = service.name || owner?.name || service.id.slice(0, 6);
    if (service.type === 'VALVE') return `${base} (Ventil)`;
    if (service.type === 'MOWER') return `${base} (Mäher)`;
    if (service.type === 'POWER_SOCKET') return `${base} (Steckdose)`;
    if (service.type === 'SENSOR') return `${base} (Sensor)`;
    return base;
}

function archetypeFor(service) {
    return service.type === 'SENSOR' ? 'CLIMATE_SENSOR' : 'SWITCH';
}

function isActuatorOn(service) {
    const activity = String((service.state || {}).activity || '').toUpperCase();
    switch (service.type) {
        case 'POWER_SOCKET':
            return POWER_SOCKET_ON.has(activity);
        case 'VALVE':
            return VALVE_WATERING.has(activity);
        case 'MOWER':
            return MOWER_ACTIVE.has(activity);
        default:
            return false;
    }
}

function clampTemperature(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    return Math.max(-50, Math.min(60, v));
}

function buildFeatures(service, owner) {
    const features = [];
    const s = service.state || {};

    if (service.type === 'SENSOR') {
        // Prefer soil temp (outdoor soil sensor) but fall back to ambient.
        const soilTemp = clampTemperature(s.soilTemperature);
        const ambientTemp = clampTemperature(s.ambientTemperature ?? s.temperature);
        const temp = soilTemp !== undefined ? soilTemp : ambientTemp;
        if (temp !== undefined) {
            features.push({ type: 'actualTemperature', actualTemperature: temp });
        }

        // Soil humidity percent (0..100) -> HMIP expects 0..100 for humidity.
        const humidityPct = typeof s.soilHumidity === 'number' ? s.soilHumidity : s.humidity;
        if (typeof humidityPct === 'number' && Number.isFinite(humidityPct)) {
            features.push({ type: 'humidity', humidity: Math.max(0, Math.min(100, humidityPct)) });
        }

        // Smart Sensor reports brightness in lux as `lightIntensity` (primary)
        // or occasionally as `illumination`.
        //
        // NOTE: the Connect API Illumination feature (spec 1.0.1 §6.7.15) is a
        // Double with a HARD range of 0..20000 lux. The HCU's Jackson validator
        // rejects the whole STATUS envelope if the value is out of range, which
        // would silently stop ALL updates for this sensor. The Gardena sensor
        // measures well past 100000 lux, but the HMIP app can only display up
        // to 20000 lux through this feature — so we MUST clamp here. Do not
        // remove this cap; raising it past 20000 breaks the device entirely.
        const lux = typeof s.lightIntensity === 'number' ? s.lightIntensity : s.illumination;
        if (typeof lux === 'number' && Number.isFinite(lux)) {
            features.push({
                type: 'illumination',
                illumination: Math.max(0, Math.min(20000, lux)),
            });
        }
    } else {
        features.push({ type: 'switchState', on: isActuatorOn(service) });
    }

    // Always include a maintenance feature so the HMIP app can show the
    // device as "reachable" immediately — omitting the feature (or flipping
    // unreach true on UNKNOWN) leaves the app stuck in connecting state.
    features.push(buildMaintenance(owner));

    return features;
}

/**
 * Translate the Gardena COMMON-service fields (batteryState, rfLinkState)
 * into a Maintenance feature. Always returns a feature for controllable /
 * sensor services so the HMIP app can render a connection indicator.
 *
 * Gardena batteryState: OK | LOW | REPLACE_NOW | OUT_OF_OPERATION |
 *                       CHARGING | NO_BATTERY | UNKNOWN
 * Gardena rfLinkState:  ONLINE | OFFLINE | UNKNOWN
 *
 * We only flip unreach=true on explicit OFFLINE; UNKNOWN / missing counts
 * as "reachable", otherwise the app stays stuck at "Verbindung wird
 * aufgebaut..." during the short window between snapshot load and the
 * first websocket push.
 */
function buildMaintenance(owner) {
    const lowBatStates = new Set(['LOW', 'REPLACE_NOW', 'OUT_OF_OPERATION']);
    const feature = { type: 'maintenance', lowBat: false, unreach: false };

    if (owner && owner.batteryState) {
        feature.lowBat = lowBatStates.has(String(owner.batteryState).toUpperCase());
    }
    if (owner && owner.rfLinkState) {
        feature.unreach = String(owner.rfLinkState).toUpperCase() === 'OFFLINE';
    }
    return feature;
}

function toDevice(service, owner) {
    return {
        deviceId: deviceIdFor(service.id),
        deviceType: archetypeFor(service),
        modelType: owner?.modelType || service.type,
        firmwareVersion: owner?.firmwareVersion || '1.0.0',
        friendlyName: labelFor(service, owner),
        features: buildFeatures(service, owner),
    };
}

// STATUS_RESPONSE expects full Device objects (Connect API 6.3.11). HCUweb
// and the iOS app need the metadata (modelType, firmwareVersion, friendlyName)
// to finish registering the device, otherwise they stay in a "connecting"
// state.
function toStatus(service, owner) {
    return toDevice(service, owner);
}

// STATUS_EVENT is a *partial* update (Connect API 6.3.10) and only carries
// deviceId + features. Sending anything else here (deviceType, modelType, ...)
// is treated as a re-registration attempt and keeps the app stuck.
function toStatusEvent(service, owner) {
    return {
        deviceId: deviceIdFor(service.id),
        features: buildFeatures(service, owner),
    };
}

/**
 * Translate an HMIP control request into a Gardena v2 command body, or null
 * when the request cannot be expressed (e.g. sensor, unsupported type).
 */
function controlToGardenaCommand(service, features, path) {
    const desiredSwitch = (features || []).find((f) => f.type === 'switchState');
    if (!desiredSwitch && !path) return null;
    const on = desiredSwitch ? Boolean(desiredSwitch.on) : path && !path.endsWith('/setSwitchState/off');

    switch (service.type) {
        case 'POWER_SOCKET':
            return {
                data: {
                    type: 'POWER_SOCKET_CONTROL',
                    id: 'hmip-' + Date.now(),
                    attributes: on
                        ? { command: 'START_OVERRIDE' }
                        : { command: 'STOP_UNTIL_NEXT_TASK' },
                },
            };
        case 'VALVE':
            return {
                data: {
                    type: 'VALVE_CONTROL',
                    id: 'hmip-' + Date.now(),
                    attributes: on
                        ? {
                              command: 'START_SECONDS_TO_OVERRIDE',
                              seconds: cfg.gardena.defaultValveDurationSec,
                          }
                        : { command: 'STOP_UNTIL_NEXT_TASK' },
                },
            };
        case 'MOWER':
            return {
                data: {
                    type: 'MOWER_CONTROL',
                    id: 'hmip-' + Date.now(),
                    attributes: on
                        ? { command: 'START_DONT_OVERRIDE' }
                        : { command: 'PARK_UNTIL_NEXT_TASK' },
                },
            };
        default:
            return null;
    }
}

module.exports = {
    deviceIdFor,
    parseDeviceId,
    isExposable,
    toDevice,
    toStatus,
    toStatusEvent,
    controlToGardenaCommand,
};
