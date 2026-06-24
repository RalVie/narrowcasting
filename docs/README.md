# Narrowcasting Phase 3

Single-screen local-first Raspberry Pi digital signage MVP with a basic media library.

## Boundaries

- Playback is always local.
- Management is optional.
- Media must be cached locally before playback.
- Players must continue when the server, internet, or network is offline.
- MQTT is not implemented yet, but player and agent code leave room for urgent commands later.
- No authentication, uploads, scheduling engine, Cloudflare setup, systemd services, database, video, playlist editor, multi-screen support, or commercial multi-tenant features yet.

## Parts

- `server`: Node.js, TypeScript, Fastify, health endpoint, static image schedule endpoint, media upload/list/delete API, example media serving, and SQLite-ready structure.
- `dashboard`: React, TypeScript, Vite management shell with read-only schedule preview and basic media library.
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
SERVER_URL=http://localhost:3000 CACHE_DIR=../player/public/data MEDIA_DIR=../player/public/media npm run dev
```

### Player

The player reads the local schedule from `/data/schedule.json`, reloads it every 30 seconds, and renders image items from `/media/<file>`. Images are displayed fullscreen on a black background while preserving aspect ratio. If an image file is missing locally, the player shows a placeholder message for that item.

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

- A read-only Schedule Preview page that reads the server schedule and displays item type, filename, and duration.
- A Media Library page for image upload, thumbnail preview, refresh, and delete.

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

## Test Schedule Updates

1. Edit `server/src/schedule/staticSchedule.ts`, for example change a duration or referenced image filename.
2. Upload the matching file through the dashboard or add it to `server/public/media/`.
3. Restart the server if the dev watcher has not already reloaded it.
4. Wait up to 30 seconds for the agent to fetch the schedule and media updates.
5. Wait up to 30 seconds for the player to reload the local schedule.

## Build

```bash
cd server && npm run build
cd ../dashboard && npm run build
cd ../player && npm run build
cd ../agent && npm run build
```
