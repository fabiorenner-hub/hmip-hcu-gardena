> [🇬🇧 English](README.md) | 🇩🇪 Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-gardena-plugin Symbolbild" width="128" height="128"/>
</p>

# hmip-gardena-plugin

📦 **[hmip-gardena-plugin-1.1.0.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases/latest/download/hmip-gardena-plugin-1.1.0.tar.gz)** — Installation in HCUweb über *Entwicklermodus → Plugins → Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-gardena>

Homematic IP HCU Plugin, das **Gardena smart system** Geräte (Mäher,
Ventile, Steckdosen, Sensoren) über die offizielle Husqvarna-v2-API in die
HMIP-App bringt.

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie hilft
mir, weitere HCU-Plugins zu bauen und zu pflegen.

<form action="https://www.paypal.com/donate" method="post" target="_top"><input type="hidden" name="hosted_button_id" value="JPZRATUUHRT5C" /><input type="image" src="https://www.paypalobjects.com/de_DE/DE/i/btn/btn_donate_SM.gif" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Spenden mit dem PayPal-Button" /><img alt="" border="0" src="https://www.paypal.com/de_DE/i/scr/pixel.gif" width="1" height="1" /></form>

## Auf der HCU installieren

1. Aktuellste `hmip-gardena-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases) holen.
2. In HCUweb *Entwicklermodus → Plugins → Aus Datei installieren* öffnen und hochladen.
3. Plugin-Kachel öffnen → *Konfiguration* und Husqvarna-API-Zugangsdaten
   eintragen (**API Key** / **API Secret** aus dem
   [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)).
4. Speichern. Nach dem OAuth-Login erscheinen deine Gardena-Geräte im HMIP-Posteingang.

## Selbst bauen

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## Voraussetzungen auf der HCU

- HCU1 mit Firmware 1.4.7+
- Entwicklermodus aktiviert
- HCU mit Internetzugang

## Herausgeber

Herausgegeben von **Fabio Renner**.

## Lizenz

Apache-2.0
