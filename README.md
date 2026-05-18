> 🇬🇧 English | [🇩🇪 Deutsch](README.de.md)

# hmip-gardena-plugin

Homematic IP HCU plugin that brings Gardena smart system devices (mowers,
valves, power sockets, sensors) into the HMIP app — inspired by the Home
Assistant integration `hass-gardena-smart-system`, but built natively as an
HCU plugin against the official Husqvarna v2 API.

```
HMIP App  <->  HCU  <-wss->  hmip-gardena-plugin  <-https/wss->  Husqvarna Cloud  <-->  Gardena Gateway
```

## Install on your HCU

1. Download `hmip-gardena-plugin-<version>.tar.gz` from the
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases).
2. In HCUweb open *Developer mode → Plugins → Install from file* and upload it.
3. Open the tile → *Configuration* and fill in:
   - **Husqvarna Application Key (Client ID)**
   - **Husqvarna Application Secret**
   - **Location ID** (only needed if your Husqvarna account has more than
     one location; otherwise leave blank)
4. Save. The plugin obtains an OAuth token, loads the device list, opens the
   status WebSocket and registers all discovered services with the HCU.
5. Devices appear in the HMIP app's inbox and can be assigned to rooms.

## Prerequisites

- Homematic IP **HCU1** with firmware 1.4.7+
- Husqvarna developer account: https://developer.husqvarnagroup.cloud/
- Create an **Application** there and connect **two APIs**:
  - **Authentication API**
  - **GARDENA smart system API**
- Note the *Application Key* (Client ID) and *Application Secret*

## Build the install file yourself

Requires Docker + buildx (Linux or macOS with Docker Desktop).

```bash
cd hmip-gardena-plugin
chmod +x build.sh
./build.sh
```

This produces `hmip-gardena-plugin-<version>.tar.gz`.

## Device mapping

| Gardena service       | HMIP archetype    | Feature                            |
| --------------------- | ----------------- | ---------------------------------- |
| Smart Power Socket    | `LIGHT`           | `switchState` (on/off)             |
| Smart Water Control   | `LIGHT`           | `switchState` (on = open 30 min)   |
| Smart Irrigation      | `LIGHT`           | `switchState` (one per valve)      |
| Smart Mower (Sileno)  | `LIGHT`           | `switchState` (on = mow, off = park)|
| Smart Sensor          | `CLIMATE_SENSOR`  | `actualTemperature`, `humidity`    |
| any battery-powered   | additionally      | `batteryState`                     |

Background: HMIP SDK 1.0.1 has no dedicated *valve* or *mower* archetype, so
actuators are exposed as the universal `LIGHT` type with `switchState`.
You can rename the tiles in the HMIP app to match.

## Rate limits

The Gardena API allows roughly **~700 REST calls per week per account**. The
plugin uses REST only at startup and reconnect — everything else flows over
the WebSocket, including command acknowledgements. If you reconnect often,
make sure the underlying error is not a 429 from the rate limiter.

## Develop locally

```env
HMIP_HCU_HOST=hcu1-XXXX.local
HMIP_HCU_AUTH_TOKEN=<dev-token from HCUweb>
GARDENA_CLIENT_ID=...
GARDENA_CLIENT_SECRET=...
LOG_LEVEL=debug
```

```bash
npm install
npm run dev
```

## Not yet implemented

- Scheduled watering durations > 30 min / custom durations
- `startMowingSeconds` / `parkUntilNextTask` nuances (currently only on/off)
- Soil-moisture thresholds and rain sensors as separate `moistureDetected`
  features

## License

Apache-2.0
