# Production Appliance Deployment

This guide turns a Raspberry Pi into a self-starting Narrowcasting appliance.

Playback remains local. The player reads its cached schedule and media from the Pi, so cached content keeps playing when the server, network, or internet is unavailable.

For current production installs, repairs, updates and uninstalls, prefer the Appliance Manager described in [INSTALLATION.md](INSTALLATION.md). It prepares executable runtime scripts, installs Node.js/npm when needed, configures kiosk startup safely for Raspberry Pi OS Desktop, and keeps lifecycle actions behind explicit operator choices.

## Assumptions

- Repository path on the Pi: `/opt/narrowcasting`
- Service user: `pi`
- Server port: `3000`
- Player production port: `4174`
- Player kiosk URL: `http://localhost:4174/player`

If your Pi uses another user or path, edit the files in `deployment/systemd/` before installing them.

## Player And Preview Terminology

- Dedicated Player Appliance: a production player tied to one physical screen.
- Server Local Player: the optional player webapp served at `http://SERVER:4174/player` on the server. It shows only the server-local agent/player schedule and is useful for local diagnostics or testing.
- Schedule Preview: the Dashboard feature for inspecting the resolved schedule of a specific screen.

In multi-screen deployments, `http://SERVER:4174/player` is not a universal preview for all screens. Each screen can have a different resolved schedule. Use Dashboard Schedule Preview or Monitoring for per-screen output.

## Dynamic Content Pilot Notes

Product 1.1 through Product 1.3 support Web URL and RSS Feed media, Browser Renderer, Browser Automation and runtime watchdog recovery.

- Web URL items default to Embedded iframe mode, which renders fullscreen web content where the remote site allows iframe embedding.
- Web URL Browser renderer mode uses the local Chromium kiosk on a dedicated Player appliance for sites that block iframe embedding.
- Some sites block embedding through X-Frame-Options or Content-Security-Policy.
- RSS feeds are fetched and parsed by the server; the Player receives resolved RSS items.
- Web URL playback requires network access from the Player.
- RSS feed freshness depends on server access to the feed during schedule generation.
- Uploaded images and videos remain the recommended choice for fully offline playback.

## Build Production Assets

For scripted installation on Raspberry Pi/Linux, see [INSTALLATION.md](INSTALLATION.md).

Run these on the Pi from the repository root:

```bash
cd /opt/narrowcasting
npm --prefix server install
npm --prefix agent install
npm --prefix player install
npm --prefix dashboard install
./scripts/build-production.sh
```

In production, the compiled server serves the dashboard build from `dashboard/dist` at:

```text
http://PI-IP:3000/
```

No separate dashboard process or dashboard systemd service is needed.

## Make Scripts Executable

```bash
cd /opt/narrowcasting
chmod +x scripts/start-server.sh
chmod +x scripts/start-agent.sh
chmod +x scripts/start-player.sh
chmod +x scripts/start-kiosk.sh
chmod +x scripts/build-production.sh
```

## Install Services

```bash
cd /opt/narrowcasting
sudo cp deployment/systemd/narrowcasting-*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## Enable Appliance Mode

```bash
sudo systemctl enable narrowcasting-server.service
sudo systemctl enable narrowcasting-agent.service
sudo systemctl enable narrowcasting-player.service
```

Start immediately without rebooting:

```bash
sudo systemctl start narrowcasting-server.service
sudo systemctl start narrowcasting-agent.service
sudo systemctl start narrowcasting-player.service
```

Chromium kiosk startup should be configured through desktop autostart on Raspberry Pi OS Desktop:

```text
/etc/xdg/autostart/narrowcasting-kiosk.desktop
```

Do not run Chromium kiosk as a normal system service on Raspberry Pi OS Desktop. It needs an active graphical login/session.

## Disable Appliance Mode

```bash
sudo systemctl disable narrowcasting-player.service
sudo systemctl disable narrowcasting-agent.service
sudo systemctl disable narrowcasting-server.service
```

Stop running services:

```bash
sudo systemctl stop narrowcasting-player.service
sudo systemctl stop narrowcasting-agent.service
sudo systemctl stop narrowcasting-server.service
```

## Check Status And Logs

```bash
systemctl status narrowcasting-server.service
systemctl status narrowcasting-agent.service
systemctl status narrowcasting-player.service
```

```bash
journalctl -u narrowcasting-server.service -f
journalctl -u narrowcasting-agent.service -f
journalctl -u narrowcasting-player.service -f
```

## Kiosk Configuration

The kiosk launcher opens Chromium in fullscreen kiosk mode with no browser chrome, address bar, or tabs.

Default URL:

```text
http://localhost:4174/player
```

Override the kiosk URL by editing `/etc/narrowcasting/kiosk.env`:

```bash
KIOSK_URL=http://localhost:4174/player
```

The player installer creates a dedicated Chromium appliance profile:

```bash
CHROMIUM_PROFILE_DIR=/opt/narrowcasting/player/chromium-kiosk-profile
```

This keeps kiosk browser state separate from the normal desktop browser profile and suppresses first-run, default-browser, password/keyring, restore, sign-in, and translate prompts.

On every kiosk start, the launcher initializes kiosk-friendly Chromium profile preferences for the dedicated profile. These preferences disable browser-owned prompts for translate, password manager, autofill, notifications, camera, microphone, geolocation, popups, sign-in, sync, and session restore prompts where Chromium supports it.

The launcher also logs the Chromium version, profile path, kiosk URL, local Browser renderer control URL, local DevTools endpoint, and active kiosk flags to stderr/journal output. This helps verify appliance startup without opening Chromium UI.

The kiosk also enables a local-only Chromium DevTools endpoint for Web URL Browser renderer mode:

```bash
CHROMIUM_REMOTE_DEBUGGING_ADDRESS=127.0.0.1
CHROMIUM_REMOTE_DEBUGGING_PORT=9222
```

This must remain bound to localhost. Never expose port `9222` on the network.

The Agent exposes a local-only browser renderer control endpoint on `127.0.0.1:4175`. The Player uses this endpoint only for resolved Web URL schedule items with Browser renderer mode. The endpoint temporarily navigates the active Chromium kiosk page to the external URL and returns it to `http://localhost:4174/player` after the configured duration.

Product 1.3 Browser Automation is also executed by the Agent through the local Chromium CDP connection. Supported actions are WAIT, CLICK and REFRESH. Operators configure bounded actions; Narrowcasting does not execute arbitrary JavaScript or bypass website security.

The Agent also runs a lightweight runtime watchdog on Player appliances. The watchdog checks Chromium, local CDP and the Player URL. Recovery starts by returning Chromium to `/player`, then escalates to Chromium/kiosk restart, `narrowcasting-player` restart, `narrowcasting-agent` restart and, only if explicitly enabled, reboot. Watchdog status is written to the configured runtime watchdog status file for future Monitoring use.

Cookie consent dialogs, language selectors, and modal overlays generated by the website itself cannot be generically removed by Narrowcasting. Browser-owned UI should be suppressed by the kiosk profile and flags; website-owned UI must be handled by the website, customer configuration, or a future site-specific policy.

After building the Agent, the manual diagnostic command remains available:

```bash
cd agent
npm run browser-renderer:test -- https://app.full-pull.nl/scherm 30
```

The command connects to the local kiosk browser, navigates the active Chromium page to the URL for 30 seconds, and then attempts to return to `http://localhost:4174/player`.

If Chromium is installed under a different command name, set:

```bash
CHROMIUM_BIN=/usr/bin/chromium-browser
```

On Raspberry Pi OS Desktop, kiosk startup is installed as desktop autostart. It starts after graphical login/session availability. On OS Lite or systems without a graphical session, kiosk startup is skipped with a warning.

For fully unattended boot, enable automatic desktop login in Raspberry Pi OS Desktop. The kiosk launcher also attempts to disable screen blanking, screen saver, DPMS/display sleep, and hide the mouse cursor when the desktop provides the required helper commands.

## Remote Dashboard Access

Production management URL:

```text
http://PI-IP:3000/
```

The same server also serves:

```text
http://PI-IP:3000/api/...
http://PI-IP:3000/media/...
```

The optional Server Local Player remains separate:

```text
http://PI-IP:4174/player
```

This URL displays only the schedule cached by the local player/agent on that machine. It does not mirror every registered screen.

Development dashboard access remains unchanged:

```bash
cd /opt/narrowcasting/dashboard
npm run dev
```

From a Windows PC on the same network, open:

```text
http://PI-IP:5173
```

The dashboard automatically calls:

```text
http://PI-IP:3000
```

To point the dashboard at a different API endpoint:

```bash
VITE_API_BASE_URL=http://PI-IP:3000 npm run dev
```

## Boot Recovery Procedure

Power loss recovery is handled by systemd plus the startup scripts.

Expected sequence after power returns:

1. Pi boots.
2. `narrowcasting-server.service` starts the compiled server.
3. `narrowcasting-agent.service` starts the compiled agent.
4. `narrowcasting-player.service` starts the production player server.
5. Desktop autostart launches Chromium fullscreen at `http://localhost:4174/player` after graphical login/session availability.
6. The player reads `player/public/data/schedule.json`.
7. The player renders cached media from `player/public/media/`.

If the server is unavailable, cached playback still continues because the player does not depend on the server at playback time.

## Recovery Checks

After reboot:

```bash
curl http://localhost:3000/api/status
curl http://localhost:3000/api/agent-status
curl http://localhost:4174/player
```

Check cached playback inputs:

```bash
ls -lah /opt/narrowcasting/player/public/data/schedule.json
ls -lah /opt/narrowcasting/player/public/media/
```

If the fullscreen player does not appear:

```bash
cat /etc/xdg/autostart/narrowcasting-kiosk.desktop
/opt/narrowcasting/scripts/start-kiosk.sh
```

If playback appears but content is stale:

```bash
systemctl status narrowcasting-agent.service
journalctl -u narrowcasting-agent.service -n 100
curl http://localhost:3000/api/schedule
```

## Production Routes

- Management dashboard: `http://PI-IP:3000/`
- Server API: `http://PI-IP:3000`
- Media: `http://PI-IP:3000/media/...`
- Server Local Player: `http://PI-IP:4174/player`
- Kiosk target on the Pi: `http://localhost:4174/player`

Use Dashboard Schedule Preview for per-screen resolved schedules.

## Development Workflows

Existing development commands still work:

```bash
cd server && npm run dev
cd ../agent && npm run dev
cd ../player && npm run dev
cd ../dashboard && npm run dev
```

Production appliance mode is additive. It does not replace development mode.
