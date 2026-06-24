# Production Appliance Deployment

This guide turns a Raspberry Pi into a self-starting Narrowcasting appliance.

Playback remains local. The player reads its cached schedule and media from the Pi, so cached content keeps playing when the server, network, or internet is unavailable.

## Assumptions

- Repository path on the Pi: `/opt/narrowcasting`
- Service user: `pi`
- Server port: `3000`
- Player production port: `4174`
- Player kiosk URL: `http://localhost:4174/player`

If your Pi uses another user or path, edit the files in `deployment/systemd/` before installing them.

## Build Production Assets

Run these on the Pi from the repository root:

```bash
cd /opt/narrowcasting/server
npm install
npm run build

cd /opt/narrowcasting/agent
npm install
npm run build

cd /opt/narrowcasting/player
npm install
npm run build

cd /opt/narrowcasting/dashboard
npm install
npm run build
```

The dashboard build remains available for future production hosting. Existing development dashboard workflows are unchanged.

## Make Scripts Executable

```bash
cd /opt/narrowcasting
chmod +x scripts/start-server.sh
chmod +x scripts/start-agent.sh
chmod +x scripts/start-player.sh
chmod +x scripts/start-kiosk.sh
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
sudo systemctl enable narrowcasting-kiosk.service
```

Start immediately without rebooting:

```bash
sudo systemctl start narrowcasting-server.service
sudo systemctl start narrowcasting-agent.service
sudo systemctl start narrowcasting-player.service
sudo systemctl start narrowcasting-kiosk.service
```

## Disable Appliance Mode

```bash
sudo systemctl disable narrowcasting-kiosk.service
sudo systemctl disable narrowcasting-player.service
sudo systemctl disable narrowcasting-agent.service
sudo systemctl disable narrowcasting-server.service
```

Stop running services:

```bash
sudo systemctl stop narrowcasting-kiosk.service
sudo systemctl stop narrowcasting-player.service
sudo systemctl stop narrowcasting-agent.service
sudo systemctl stop narrowcasting-server.service
```

## Check Status And Logs

```bash
systemctl status narrowcasting-server.service
systemctl status narrowcasting-agent.service
systemctl status narrowcasting-player.service
systemctl status narrowcasting-kiosk.service
```

```bash
journalctl -u narrowcasting-server.service -f
journalctl -u narrowcasting-agent.service -f
journalctl -u narrowcasting-player.service -f
journalctl -u narrowcasting-kiosk.service -f
```

## Kiosk Configuration

The kiosk service launches Chromium in fullscreen kiosk mode with no browser chrome, address bar, or tabs.

Default URL:

```text
http://localhost:4174/player
```

Override the kiosk URL by editing `deployment/systemd/narrowcasting-kiosk.service` before installation:

```ini
Environment=KIOSK_URL=http://localhost:4174/player
```

If Chromium is installed under a different command name, set:

```ini
Environment=CHROMIUM_BIN=/usr/bin/chromium-browser
```

If the Pi uses a display user other than `pi`, update:

```ini
User=pi
Environment=XAUTHORITY=/home/pi/.Xauthority
Environment=XDG_RUNTIME_DIR=/run/user/1000
```

## Remote Dashboard Access

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
5. `narrowcasting-kiosk.service` launches Chromium fullscreen at `http://localhost:4174/player`.
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
systemctl status narrowcasting-kiosk.service
journalctl -u narrowcasting-kiosk.service -n 100
```

If playback appears but content is stale:

```bash
systemctl status narrowcasting-agent.service
journalctl -u narrowcasting-agent.service -n 100
curl http://localhost:3000/api/schedule
```

## Production Routes

- Server API: `http://PI-IP:3000`
- Production player: `http://PI-IP:4174/player`
- Kiosk target on the Pi: `http://localhost:4174/player`

## Development Workflows

Existing development commands still work:

```bash
cd server && npm run dev
cd ../agent && npm run dev
cd ../player && npm run dev
cd ../dashboard && npm run dev
```

Production appliance mode is additive. It does not replace development mode.
