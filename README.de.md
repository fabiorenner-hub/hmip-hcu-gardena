> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-gardena-plugin Symbolbild" width="128" height="128"/>
</p>

# hmip-gardena-plugin

📦 **[hmip-gardena-plugin-1.3.1-arm64.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases/latest/download/hmip-gardena-plugin-1.3.1-arm64.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-gardena>

Homematic IP HCU Plugin, das **Gardena smart system** Geräte (Mäher,
Ventile, Steckdosen, Sensoren) über die offizielle Husqvarna-v2-API in die
HMIP-App bringt.

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie
hält bei mir die Lichter an, während ich weitere HCU-Plugins baue:
[Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Auf der HCU installieren

1. Aktuelle `hmip-gardena-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases) holen.
2. In HCUweb *Entwicklermodus → Plugins → Aus Datei installieren* öffnen und hochladen.
3. Plugin-Kachel öffnen → *Konfiguration* und Husqvarna-API-Zugangsdaten
   eintragen (**API Key** / **API Secret** aus dem
   [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)).
4. Speichern. Nach dem OAuth-Login erscheinen deine Gardena-Geräte im HMIP-Posteingang.

## Dashboard

Das Plugin stellt ein lokales Status-Dashboard (Dark-Glass-Oberfläche, DE/EN)
unter `http://<HCU-Adresse>:8094` bereit — Live-Gerätestatus, Diagnose, Logs
mit 360°-Export und Update-Hinweis. In der *Konfiguration* lässt es sich
abschalten oder der Port ändern; der Container hält Port **8094** für seinen
Health-Check stets erreichbar.

> Hinweis: Der **Helligkeitswert** der Gardena-Sensoren wird bis **20.000 lx**
> angezeigt. Das ist das Maximum der Connect-API-Feature `Illumination`
> (Spec §6.7.15), keine Plugin-Grenze — höhere Werte kann die HMIP-App nicht
> darstellen.

### Updates (OTA)

Ab v1.3.0 kann sich das Plugin über GitHub-Releases selbst aktualisieren.
Im *Updates*-Tab des Dashboards kannst du auf Updates prüfen, zwischen dem
Kanal **Stabil** und **Experimentell** wechseln und **manuellen** oder
**automatischen** Modus wählen. Das stabile Kern-Image bleibt immer als
Fallback installiert, ein fehlerhaftes Update rollt automatisch zurück. Die
Erst-Installation (und ein nötiges Kern-Update) bleibt ein manueller
`.tar.gz`-Upload in HCUweb.

## Selbst bauen

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## Voraussetzungen auf der HCU

- HCU1 mit Firmware **1.4.7 oder neuer**
- Entwicklermodus aktiviert
- HCU mit Internetzugang

## Herausgeber

Herausgegeben von **Fabio Renner**.

### Verwendete Drittanbieter

- Verwendet die offizielle [Husqvarna Authentication API und Gardena smart system API v2](https://developer.husqvarnagroup.cloud/).
- Gardena und das smart system sind Produkte der Husqvarna Group; dieses Plugin ist mit Husqvarna / Gardena nicht verbunden und wird nicht unterstützt.
- Gebaut gegen die [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api) von eQ-3.

## Lizenz

Apache-2.0
