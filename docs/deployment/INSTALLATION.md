# Installation Scripts

This document describes the production installation scripts for Raspberry Pi/Linux deployments.

## Scripts

```text
scripts/install-server.sh
scripts/install-player.sh
```

## Server Install

Target:

- Raspberry Pi or Linux host.
- Repository checked out locally.

Responsibilities:

- Verify supported Linux environment.
- Install required system dependencies.
- Install Node dependencies for server, dashboard, agent, and player.
- Build server, dashboard, agent, and player.
- Create required data directories without deleting existing data.
- Configure or prompt for the admin key.
- Install or update the server systemd service.
- Optionally install or update the agent systemd service.
- Expose dashboard and API on port `3000`.
- Expose the player on port `4174` when the same host also runs playback.

Example:

```bash
cd /opt/narrowcasting
chmod +x scripts/install-server.sh scripts/install-player.sh scripts/update-production.sh
scripts/install-server.sh --yes --start
```

Safety requirements:

- Do not delete media, schedules, data, config, or audit files.
- Do not overwrite existing config without confirmation.
- Be idempotent where practical.
- Support a dry-run mode if practical.

## Player-Only Install

Target:

- Raspberry Pi or Linux playback device.

Responsibilities:

- Install required system dependencies.
- Build or fetch the player.
- Configure the player server URL.
- Configure Chromium kiosk startup.
- Configure autostart after boot.
- Preserve media cache and schedule cache.
- Preserve player identity unless explicitly reset.
- Allow normal reset and re-registration when the server rejects stale screen credentials.

Example:

```bash
cd /opt/narrowcasting
chmod +x scripts/install-player.sh
scripts/install-player.sh --yes --start
```

Safety requirements:

- Do not clear browser/device identity during installation unless explicitly requested.
- Do not delete cached media or cached schedules.
- Do not overwrite kiosk configuration without confirmation.

## Validation

Each install script should end with clear checks:

- service status;
- reachable dashboard/API URL;
- reachable player URL;
- data directory existence;
- systemd enablement state.
