# Installation Scripts

This document describes the production installation scripts for Raspberry Pi/Linux deployments.

## Scripts

```text
scripts/install.sh
scripts/install-server.sh
scripts/install-player.sh
```

`scripts/install.sh` is the recommended interactive appliance manager. It shows a menu for:

1. Install Server
2. Install Player
3. Update Installation
4. Repair Installation
5. Uninstall
6. Exit

The unified installer does not replace the existing installers. It guides the operator and then calls the existing authoritative scripts.

Recommended interactive start:

```bash
cd /opt/narrowcasting
./scripts/install.sh
```

Direct scripts remain available for advanced/manual installs and automation.

## Appliance Lifecycle

Use `scripts/install.sh` for the normal appliance lifecycle:

- Install Server: runs the authoritative server installer.
- Install Player: attempts to discover a Narrowcasting Server on the local network, allows manual override, and runs the authoritative player installer.
- Update Installation: pulls and rebuilds the selected appliance components, then restarts the relevant services.
- Repair Installation: re-runs the appropriate authoritative installer to restore dependencies, builds, directories, services, kiosk configuration, Browser Renderer configuration, watchdog installation and autostart without removing user data.
- Uninstall: removes selected appliance components using the safety rules below.

Repair is intended for broken or incomplete installations. It must not remove media, campaigns, playlists, programs, assignments, configuration, screen registrations, schedule cache, player identity or browser cache.

When repairing a Player appliance, the Appliance Manager first reads the existing `SERVER_URL` from `/etc/narrowcasting/agent.env` when available. If that configured server is reachable and validates as a Narrowcasting Server, the operator can keep it. If it is missing or unreachable, the manager runs the same local network discovery used by Player install, then falls back to manual entry when needed. In non-interactive mode, `--server-url` takes priority; otherwise a reachable existing server or exactly one discovered server is required.

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
chmod +x scripts/install.sh scripts/install-server.sh scripts/install-player.sh scripts/update-production.sh
./scripts/install.sh
```

Advanced/manual server install:

```bash
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
./scripts/install.sh
```

The interactive Appliance Manager first attempts to discover a Narrowcasting Server on the same local IPv4 subnet. Discovery checks port `3000` and validates the Narrowcasting API/status response so arbitrary port `3000` services are not accepted.

If one server is found, the installer asks whether to use it. If multiple servers are found, it shows a numbered list. If none are found, it falls back to manual Server URL entry. Manual entry remains supported at all times.

Discovery requires:

- the server to be reachable from the player appliance;
- port `3000` open on the server;
- `curl` available on the player appliance.

The interactive installer then asks whether services should start after installation.

Recommended interactive player install:

```bash
cd /opt/narrowcasting
./scripts/install.sh
```

Manual player install through the Appliance Manager:

```bash
./scripts/install.sh --server-url http://SERVER-IP:3000
```

Advanced/manual player install:

```bash
./scripts/install-player.sh --server-url http://SERVER-IP:3000 --start
```

For unattended installs, combine `--yes` with an explicit server URL:

```bash
./scripts/install.sh --yes --server-url http://SERVER-IP:3000
```

In non-interactive `--yes` mode, the Appliance Manager uses `--server-url` when supplied. If no server URL is supplied, it only proceeds automatically when exactly one verified Narrowcasting Server is discovered. If none or multiple servers are found, it stops with a clear message asking for `--server-url`.

The direct player installer remains available for advanced/manual installs:

```bash
./scripts/install-player.sh --yes --server-url http://SERVER-IP:3000 --start
```

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

## Uninstall

The Appliance Manager supports:

1. Player only
2. Server only
3. Everything
4. Cancel

Uninstall always asks for confirmation before changing the system.

Soft uninstall removes installed services, kiosk/autostart entries, Node dependencies, production builds and temporary build cache. It leaves media, campaigns, programs, playlists, assignments, configuration and runtime data intact.

Full uninstall is intentionally harder to trigger. The operator must first choose to remove application data, then type:

```text
REMOVE
```

Full uninstall may also remove media, schedules, configuration, cache, logs, browser profile and runtime data, depending on the selected target and follow-up confirmations. Repository removal is a separate explicit confirmation.
