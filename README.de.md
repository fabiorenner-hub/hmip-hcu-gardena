> [ðŸ‡¬ðŸ‡§ English](README.md) | ðŸ‡©ðŸ‡ª Deutsch

<p align="center">
  <img src="icon.svg" alt="hmip-gardena-plugin Symbolbild" width="128" height="128"/>
</p>

# hmip-gardena-plugin

ðŸ“¦ **[hmip-gardena-plugin-1.1.1.tar.gz herunterladen](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases/latest/download/hmip-gardena-plugin-1.1.1.tar.gz)** â€” Installation in HCUweb Ã¼ber *Entwicklermodus â†’ Plugins â†’ Aus Datei installieren*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-gardena>

Homematic IP HCU Plugin, das **Gardena smart system** GerÃ¤te (MÃ¤her,
Ventile, Steckdosen, Sensoren) Ã¼ber die offizielle Husqvarna-v2-API in die
HMIP-App bringt.

## Spenden

Wenn dir dieses Plugin hilft, freue ich mich über eine kleine Spende — sie
hält bei mir die Lichter an, während ich weitere HCU-Plugins baue:
[Spenden via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Auf der HCU installieren

1. Aktuellste `hmip-gardena-plugin-<version>.tar.gz` aus den
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases) holen.
2. In HCUweb *Entwicklermodus â†’ Plugins â†’ Aus Datei installieren* Ã¶ffnen und hochladen.
3. Plugin-Kachel Ã¶ffnen â†’ *Konfiguration* und Husqvarna-API-Zugangsdaten
   eintragen (**API Key** / **API Secret** aus dem
   [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)).
4. Speichern. Nach dem OAuth-Login erscheinen deine Gardena-GerÃ¤te im HMIP-Posteingang.

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
