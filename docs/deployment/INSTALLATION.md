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

Admin access:

- `NARROWCASTING_ADMIN_KEY` in the server environment is the single server-side admin key.
- Browsers may remember an admin session locally, but the entered key is validated by the server.
- A second browser must use the same server admin key.

## Player-Only Install

Target:

- Raspberry Pi or Linux playback device.

Responsibilities:

- Install required system dependencies.
- Install Node.js/npm on Debian/Raspberry Pi OS when missing or too old and system package installation is enabled.
- Build the player.
- Build the agent.
- Configure the player server URL.
- Configure the agent sync service.
- Configure Chromium kiosk desktop autostart when a graphical session is available.
- Configure a dedicated Chromium appliance profile.
- Configure autostart after boot.
- Preserve media cache and schedule cache.
- Preserve player identity unless explicitly reset.
- Allow normal reset and re-registration when the server rejects stale screen credentials.

Example:

```bash
cd /opt/narrowcasting
chmod +x scripts/install-player.sh
./scripts/install-player.sh --server-url http://SERVER-IP:3000 --start
```

For unattended installs, combine `--yes` with an explicit server URL:

```bash
./scripts/install-player.sh --yes --server-url http://SERVER-IP:3000 --start
```

If `--server-url` is omitted, the installer prompts for the server URL in interactive mode. In `--yes` mode it falls back to `http://localhost:3000` with a warning, which is usually only correct for combined server/player appliances.

If `/etc/narrowcasting/agent.env` already exists, the installer preserves it and prints the currently configured `SERVER_URL`. To change the server URL later, edit the file:

```bash
sudo nano /etc/narrowcasting/agent.env
```

Or update only the server URL:

```bash
sudo sed -i 's#^SERVER_URL=.*#SERVER_URL=http://SERVER-IP:3000#' /etc/narrowcasting/agent.env
sudo systemctl restart narrowcasting-agent.service
```

Safety requirements:

- Do not clear browser/device identity during installation unless explicitly requested.
- Do not delete cached media or cached schedules.
- Do not delete agent status, registration, or sync cache files.
- Do not overwrite kiosk configuration without confirmation.
- Do not run Chromium kiosk as a normal system service on Raspberry Pi OS Desktop.

Kiosk startup:

- `narrowcasting-agent.service` and `narrowcasting-player.service` are system services.
- Chromium kiosk startup is installed through desktop autostart at `/etc/xdg/autostart/narrowcasting-kiosk.desktop`.
- On Raspberry Pi OS Lite or systems without a graphical session, kiosk autostart is skipped with a warning.
- The default kiosk URL is `http://localhost:4174/player`.
- A Dedicated Player Appliance is the production player tied to one physical screen.
- A Server Local Player at `http://SERVER:4174/player` is optional and shows only the server-local agent/player schedule. It is not a universal preview of every screen in a multi-screen installation.
- Inspect per-screen output through the Dashboard Schedule Preview or Monitoring workspace.
- Chromium uses a dedicated appliance profile at `player/chromium-kiosk-profile`.
- The kiosk launcher disables first-run prompts, default-browser prompts, password/keyring prompts, restore prompts, translate prompts, browser notification/permission prompts, autofill/password prompts, screen blanking, and display power saving where Chromium and the desktop environment allow it.
- Website-owned cookie banners and language selectors are not automatically removed by Narrowcasting.
- Automatic desktop login must be enabled on Raspberry Pi OS Desktop for unattended kiosk startup after boot.

## Validation

Each install script should end with clear checks:

- service status;
- reachable dashboard/API URL;
- reachable player URL;
- data directory existence;
- systemd enablement state.
