# Narrowcasting Phase 1

Single-screen local-first Raspberry Pi digital signage MVP.

## Boundaries

- Playback is always local.
- Management is optional.
- Media must be cached locally before playback.
- Players must continue when the server, internet, or network is offline.
- MQTT is not implemented yet, but player and agent code leave room for urgent commands later.
- No authentication, uploads, scheduling engine, Cloudflare setup, systemd services, database, media files, images, video, playlist editor, multi-screen support, or commercial multi-tenant features yet.

## Parts

- `server`: Node.js, TypeScript, Fastify, health endpoint, static schedule endpoint, and SQLite-ready structure.
- `dashboard`: React, TypeScript, Vite management shell with read-only schedule preview.
- `player`: React, TypeScript, Vite fullscreen-friendly local schedule playback shell.
- `agent`: Node.js, TypeScript config loader, schedule poller, local cache writer, and heartbeat placeholder.

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

```bash
cd server
npm run dev
```

### Agent

The agent polls `GET /api/schedule` every 30 seconds and writes the local player schedule to:

```text
player/public/data/schedule.json
```

Run it after the server is started:

```bash
cd agent
npm run dev
```

Optional environment overrides:

```bash
SERVER_URL=http://localhost:3000 CACHE_DIR=../player/public/data npm run dev
```

### Player

The player reads the local schedule from `/data/schedule.json`, reloads it every 30 seconds, and rotates text items according to their `duration`.

```bash
cd player
npm run dev
```

Open:

```text
http://localhost:5174
```

### Dashboard

The dashboard includes a read-only Schedule Preview page that reads the server schedule.

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

## Test Schedule Updates

1. Start the server.
2. Start the agent.
3. Confirm the agent writes `player/public/data/schedule.json`.
4. Start the player and open `http://localhost:5174`.
5. Confirm the player displays scheduled text and rotates through items.
6. Edit `server/src/schedule/staticSchedule.ts`, for example change a title or duration.
7. Restart the server if the dev watcher has not already reloaded it.
8. Wait up to 30 seconds for the agent to fetch the update.
9. Wait up to 30 seconds for the player to reload the local schedule.
10. Stop the server.
11. Confirm the player keeps displaying content from `player/public/data/schedule.json`.

## Build

```bash
cd server && npm run build
cd ../dashboard && npm run build
cd ../player && npm run build
cd ../agent && npm run build
```
