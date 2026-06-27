# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-06-27

### Added
- Local status **dashboard** on port `8093` (dark-glass UI, DE/EN): live device
  state, diagnostics, logs with a 360° export, and a client-side update check.
- Dashboard **on/off toggle** and **custom port** in the plugin settings.
- Always-on `/health` endpoint on port 8093 so the container stays Docker
  `healthy` regardless of the dashboard toggle/port.

### Changed
- Robust Gardena reconnect: **exponential backoff with jitter** and a dedicated
  **HTTP 429 rate-limit cooldown** instead of a fixed 30 s retry loop, so a
  flapping connection no longer trips the Husqvarna rate limit.
- Routine websocket reconnects skip the REST snapshot reload to save quota.
- Documented that the **brightness** value is capped at 20,000 lx by the
  Connect API `Illumination` feature (spec §6.7.15) — not a plugin limitation.

### Fixed
- Added a global `uncaughtException` handler so a stray error cannot kill the
  bridge process.

## [1.1.2] - earlier
- Docs polish: README rewritten cleanly in UTF-8.

## [1.1.1] - earlier
- Plugin icon shown in HCUweb, cleaner description.

## [1.1.0] - earlier
- Plugin icon, GitHub link and donation hint in metadata, README and HCU description.

## [1.0.0] - earlier
- Initial public release.
