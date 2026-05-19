> 🇬🇧 English | [🇩🇪 Deutsch](README.de.md)

<p align="center">
  <img src="icon.svg" alt="hmip-gardena-plugin icon" width="128" height="128"/>
</p>

# hmip-gardena-plugin

📦 **[Download hmip-gardena-plugin-1.1.0.tar.gz](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases/latest/download/hmip-gardena-plugin-1.1.0.tar.gz)** — install via HCUweb → *Developer mode → Plugins → Install from file*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-gardena>

Homematic IP HCU plugin that bridges **Gardena smart system** devices
(mowers, valves, power sockets, sensors) into the HMIP app via the official
Husqvarna v2 API.

## Support this plugin

If this plugin is useful to you, please consider a small donation — it helps
me keep the lights on while building more HCU plugins.

<form action="https://www.paypal.com/donate" method="post" target="_top"><input type="hidden" name="hosted_button_id" value="JPZRATUUHRT5C" /><input type="image" src="https://www.paypalobjects.com/de_DE/DE/i/btn/btn_donate_SM.gif" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Spenden mit dem PayPal-Button" /><img alt="" border="0" src="https://www.paypal.com/de_DE/i/scr/pixel.gif" width="1" height="1" /></form>

## Install on your HCU

1. Download the latest `hmip-gardena-plugin-<version>.tar.gz` from
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases).
2. In HCUweb open *Developer mode → Plugins → Install from file* and upload it.
3. Open the plugin tile → *Configuration* and fill in your Husqvarna API
   **API key** and **API secret** (Application Key/Secret from the
   [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)).
4. Save. After OAuth your Gardena devices appear in the HMIP inbox.

## Build it yourself

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## HCU requirements

- HCU1 with firmware 1.4.7+
- Developer mode enabled
- HCU has internet access

## Author

Issued by **Fabio Renner**.

## License

Apache-2.0
