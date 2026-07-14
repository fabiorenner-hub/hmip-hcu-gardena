> 🇬🇧 English | [🇩🇪 Deutsch](README.de.md)

<p align="center">
  <img src="icon.svg" alt="hmip-gardena-plugin icon" width="128" height="128"/>
</p>

# hmip-gardena-plugin

📦 **[Download hmip-gardena-plugin-1.3.0-arm64.tar.gz](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases/latest/download/hmip-gardena-plugin-1.3.0-arm64.tar.gz)** — install via HCUweb → *Developer mode → Plugins → Install from file*.

GitHub: <https://github.com/fabiorenner-hub/hmip-hcu-gardena>

Homematic IP HCU plugin that bridges **Gardena smart system** devices
(mowers, valves, power sockets, sensors) into the HMIP app via the official
Husqvarna v2 API.

## Support

If this plugin is useful to you, please consider a small donation — it helps
me keep the lights on while building more HCU plugins:
[Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C).

## Install on your HCU

1. Download the latest `hmip-gardena-plugin-<version>.tar.gz` from
   [Releases](https://github.com/fabiorenner-hub/hmip-hcu-gardena/releases).
2. In HCUweb open *Developer mode → Plugins → Install from file* and upload it.
3. Open the plugin tile → *Configuration* and fill in your Husqvarna API
   **API key** and **API secret** (Application Key/Secret from the
   [Husqvarna Developer Portal](https://developer.husqvarnagroup.cloud/)).
4. Save. After OAuth your Gardena devices appear in the HMIP inbox.

## Dashboard

The plugin serves a local status dashboard (dark-glass UI, DE/EN) at
`http://<HCU-address>:8093` — live device state, diagnostics, logs with a
360° export and an update check. You can switch it off or change the port in
the plugin *Configuration*; the container always keeps port **8093** reachable
for its health check.

> Note: the **brightness** value of Gardena sensors is shown up to **20,000 lx**.
> That is the maximum of the Connect API `Illumination` feature (spec §6.7.15),
> not a plugin limitation — the HMIP app cannot display higher values.

### Updates (OTA)

From v1.3.0 the plugin can update itself over the air from GitHub releases.
In the dashboard *Updates* tab you can check for updates, switch between the
**stable** and **experimental** channel and choose **manual** or **automatic**
mode. The stable core image always stays installed as a fallback, so a bad
update automatically rolls back. The initial install (and a core update, when
required) is still a manual `.tar.gz` upload in HCUweb.

## Build it yourself

```powershell
./build.ps1   # Windows
```

```bash
chmod +x build.sh
./build.sh    # macOS / Linux
```

## HCU requirements

- HCU1 with firmware **1.4.7 or newer**
- Developer mode enabled
- HCU has internet access

## Author

Issued by **Fabio Renner**.

### Third-party components

- Uses the official [Husqvarna Authentication API and Gardena smart system API v2](https://developer.husqvarnagroup.cloud/).
- Gardena and the smart system are products of Husqvarna Group; this plugin is not affiliated with or endorsed by Husqvarna / Gardena.
- Built against the [Homematic IP Connect API 1.0.1](https://github.com/homematicip/connect-api) by eQ-3.

## License

Apache-2.0
