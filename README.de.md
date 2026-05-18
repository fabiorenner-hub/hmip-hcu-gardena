> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

# hmip-gardena-plugin

Homematic IP HCU Plugin, das Gardena-smart-system-Geräte (Mäher, Ventile,
Steckdosen, Sensoren) in die Homematic IP App bringt – inspiriert von der
Home-Assistant-Integration `hass-gardena-smart-system`, aber direkt als
natives HCU-Plugin über die offizielle Gardena v2 API.

```
HMIP App  <->  HCU  <-wss->  hmip-gardena-plugin  <-https/wss->  Husqvarna Cloud  <-->  Gardena Gateway
```

## Auf der HCU installieren

1. `hmip-gardena-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases)
   herunterladen.
2. In HCUweb *Entwicklermodus → Plugins → Aus Datei installieren* öffnen und
   hochladen.
3. Die Kachel öffnen → *Konfiguration* und ausfüllen:
   - **Husqvarna Application Key (Client ID)**
   - **Husqvarna Application Secret**
   - **Location ID** (nur nötig, wenn dein Husqvarna-Konto mehrere Standorte
     hat; sonst leer lassen)
4. Speichern. Das Plugin holt sich einen OAuth-Token, lädt die Geräteliste,
   öffnet den Status-WebSocket und meldet alle gefundenen Services an die HCU.
5. In der HMIP App tauchen die Geräte im Posteingang auf und können Räumen
   zugeordnet werden.

## Voraussetzungen

- Homematic IP **HCU1** mit Firmware 1.4.7+
- Husqvarna-Developer-Konto: https://developer.husqvarnagroup.cloud/
- Dort eine neue **Application** anlegen und **zwei APIs** verbinden:
  - **Authentication API**
  - **GARDENA smart system API**
- Application Key (*Client ID*) und Application Secret (*Client Secret*)
  notieren

## Selbst die Installationsdatei bauen

Auf dem Bau-Rechner: Docker + buildx (Linux oder macOS mit Docker Desktop).

```bash
cd hmip-gardena-plugin
chmod +x build.sh
./build.sh
```

Ergebnis: `hmip-gardena-plugin-<version>.tar.gz`.

## Gerätezuordnung

| Gardena-Service      | HMIP Archetype    | Feature                            |
| -------------------- | ----------------- | ---------------------------------- |
| Smart Power Socket   | `LIGHT`           | `switchState` (on/off)             |
| Smart Water Control  | `LIGHT`           | `switchState` (on = 30 min offen)  |
| Smart Irrigation     | `LIGHT`           | `switchState` (pro Ventil)         |
| Smart Mower (Sileno) | `LIGHT`           | `switchState` (on = mähen, off = parken) |
| Smart Sensor         | `CLIMATE_SENSOR`  | `actualTemperature`, `humidity`    |
| jedes mit Batterie   | zusätzlich        | `batteryState`                     |

Hintergrund: Das HMIP-SDK v1.0.1 kennt derzeit keinen eigenen *Valve*- oder
*Mower*-Archetyp. Deshalb wird für Aktoren der universelle `LIGHT`-Typ mit
`switchState` genutzt. In der HMIP App kannst du die Kacheln passend umbenennen.

## Rate Limits

Die Gardena-API erlaubt maximal **~700 REST-Calls pro Woche und Account**.
Das Plugin holt REST nur bei Start/Reconnect – danach kommt alles über den
WebSocket, inklusive Kommandobestätigungen. Wenn du häufig reconnectest,
achte darauf, dass die Fehlerursache nicht ein 429 aus dem Ratelimiter ist.

## Lokal entwickeln

```env
HMIP_HCU_HOST=hcu1-XXXX.local
HMIP_HCU_AUTH_TOKEN=<dev-token aus HCUweb>
GARDENA_CLIENT_ID=...
GARDENA_CLIENT_SECRET=...
LOG_LEVEL=debug
```

```bash
npm install
npm run dev
```

## Noch nicht implementiert

- Scheduled watering durations > 30 min / benutzerdefinierte Zeiten
- `startMowingSeconds` / `parkUntilNextTask`-Nuancen (derzeit nur on/off)
- Bodenfeuchte-Schwellwerte und Raining-Sensoren als separate
  `moistureDetected`-Features

## Lizenz

Apache-2.0
