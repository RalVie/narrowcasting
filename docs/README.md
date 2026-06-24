# Narrowcasting Phase 7

Single-screen local-first Raspberry Pi digital signage MVP with unified production runtime and safe image/video playback.

## Boundaries

- Playback is always local.
- Management is optional.
- Media must be cached locally before playback.
- Players must continue when the server, internet, or network is offline.
- MQTT is not implemented yet, but player and agent code leave room for urgent commands later.
- No authentication, scheduling engine, Cloudflare setup, database, multi-screen support, multiple playlists, drag and drop, MQTT, or commercial multi-tenant features yet.

## Parts

- `server`: Node.js, TypeScript, Fastify, health endpoint, status endpoints, image/video media upload/list/delete API, playlist API, generated schedule endpoint, example media serving, and SQLite-ready structure.
- `dashboard`: React, TypeScript, Vite management shell with system status, read-only schedule preview, basic media library, and single playlist editor.
- `player`: React, TypeScript, Vite fullscreen-friendly local image playback shell.
- `agent`: Node.js, TypeScript config loader, schedule poller, local schedule/media cache writer, and heartbeat placeholder.

## Install

Install dependencies per part:

```bash
cd server && npm install
cd ../dashboard && npm install
cd ../player && npm install
cd ../agent && npm install
```

## Development

Run each part in its own terminal.

### Server

The server exposes:

- `GET http://localhost:3000/health`
- `GET http://localhost:3000/api/schedule`
- `GET http://localhost:3000/api/media`
- `POST http://localhost:3000/api/media`
- `DELETE http://localhost:3000/api/media/:id`
- `GET http://localhost:3000/api/playlist`
- `PUT http://localhost:3000/api/playlist`
- `GET http://localhost:3000/api/status`
- `GET http://localhost:3000/api/player-cache`
- `GET http://localhost:3000/api/agent-status`
- `GET http://localhost:3000/media/welcome.jpg`

Server media files live in:

```text
server/public/media/
```

Media metadata is stored in a simple JSON file:

```text
server/data/media.json
```

There is no database yet.

The playlist is stored in:

```text
server/data/playlist.json
```

`GET /api/schedule` is generated from `server/data/playlist.json`. If no playlist exists, the server falls back to the static example schedule.

```bash
cd server
npm run dev
```

### Agent

The agent polls `GET /api/schedule` every 30 seconds and writes the local player schedule to:

```text
player/public/data/schedule.json
```

It also reads image items from the schedule, downloads referenced files from the server, skips files already present, and stores local media in:

```text
player/public/media/
```

Run it after the server is started:

```bash
cd agent
npm run dev
```

Optional environment overrides:

```bash
SERVER_URL=http://localhost:3000 CACHE_DIR=../player/public/data MEDIA_DIR=../player/public/media STATUS_PATH=../server/data/agent-status.json npm run dev
```

### Player

The player reads the local schedule from `/data/schedule.json`, reloads it every 30 seconds, and renders image/video items from `/media/<file>`. Images and videos are displayed fullscreen on a black background while preserving aspect ratio. Videos autoplay muted, play inline, and use local cached files only.

```bash
cd player
npm run dev
```

Open:

```text
http://localhost:5174
```

### Dashboard

The dashboard includes:

- A System Status page that refreshes every 10 seconds.
- A read-only Schedule Preview page that reads the server schedule and displays item type, filename, and duration.
- A Media Library page for image upload, thumbnail preview, refresh, and delete.
- A Playlists page for adding media, removing items, setting duration, reordering with up/down buttons, and saving the single playlist.

When opened from another device, the dashboard calls the server API at the dashboard hostname on port `3000`. For example, opening `http://PI-IP:5173` makes API calls to `http://PI-IP:3000`.

To override the API target:

```bash
VITE_API_BASE_URL=http://PI-IP:3000 npm run dev
```

```bash
cd dashboard
npm run dev
```

Open:

```text
http://localhost:5173
```

Default development ports:

- Server: `http://localhost:3000/health`
- Dashboard: `http://localhost:5173`
- Player: `http://localhost:5174`

## Test Media Upload, Sync, And Offline Playback

1. Start the server.
2. Start the dashboard.
3. Open the Media Library page at `http://localhost:5173`.
4. Upload an image with the file picker.
5. Confirm the image appears in the media library with thumbnail, filename, type, and size.
6. Confirm the image exists in `server/public/media/`.
7. Reference that filename from `server/src/schedule/staticSchedule.ts`.
8. Start the agent.
9. Confirm the agent writes `player/public/data/schedule.json`.
10. Confirm the agent downloads the referenced image into `player/public/media/`.
11. Start the player and open `http://localhost:5174`.
12. Confirm the player displays the image fullscreen.
13. Stop the server.
14. Confirm the agent logs a sync failure but keeps the existing local schedule and media file.
15. Confirm the player continues displaying the cached image from `player/public/media/`.

## Test Playlist Changes

1. Start the server.
2. Upload at least one image in the Media Library page.
3. Open the Playlists page.
4. Add the uploaded image to the playlist.
5. Set a duration.
6. Save the playlist.
7. Confirm `GET http://localhost:3000/api/schedule` reflects the saved playlist.
8. Wait up to 30 seconds for the agent to fetch the generated schedule.
9. Wait up to 30 seconds for the player to reload the local schedule.
10. Stop the server.
11. Confirm the player continues displaying cached playlist content offline.

## Remote Dashboard Test Procedure

On the Raspberry Pi, run these in separate terminals:

```bash
cd server
npm run dev
```

```bash
cd agent
npm run dev
```

```bash
cd player
npm run dev
```

```bash
cd dashboard
npm run dev
```

From a Windows PC on the same network, open:

```text
http://PI-IP:5173
```

Then verify:

1. Open System Status and confirm the server is online.
2. Upload an image in Media Library.
3. Confirm it appears in the media library.
4. Add the image to the playlist.
5. Set a duration and save.
6. Confirm Schedule Preview updates within 10 seconds.
7. Confirm Agent Status updates after the next sync.
8. Confirm the Pi player updates automatically.
9. Stop the server.
10. Confirm the Pi player continues playing cached content.

## Build

```bash
cd server && npm run build
cd ../dashboard && npm run build
cd ../player && npm run build
cd ../agent && npm run build
```

## Production Appliance Mode

Build all production parts:

```bash
./scripts/build-production.sh
```

Production behavior:

- Server serves the dashboard at `http://PI-IP:3000/`.
- API remains available at `http://PI-IP:3000/api/...`.
- Media remains available at `http://PI-IP:3000/media/...`.
- Player serves local playback at `http://PI-IP:4174/player`.
- No separate dashboard service is required.

For Raspberry Pi boot startup, player kiosk mode, and systemd service installation, see:

```text
docs/PRODUCTION_DEPLOYMENT.md
```
