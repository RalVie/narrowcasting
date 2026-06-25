# Narrowcasting Phase 7

Single-screen local-first Raspberry Pi digital signage MVP with unified production runtime, safe image/video playback, program-based scheduling, and theme layout frames.

## Boundaries

- Playback is always local.
- Management is optional.
- Media must be cached locally before playback.
- Players must continue when the server, internet, or network is offline.
- MQTT is not implemented yet, but player and agent code leave room for urgent commands later.
- No authentication, advanced scheduling engine, Cloudflare setup, database, multi-screen support, drag and drop, MQTT, or commercial multi-tenant features yet.

## Parts

- `server`: Node.js, TypeScript, Fastify, health endpoint, status endpoints, image/video media upload/list/delete API, playlist/program/theme/scheduler APIs, generated schedule endpoint, example media serving, and SQLite-ready structure.
- `dashboard`: React, TypeScript, Vite management shell with system status, read-only schedule preview, basic media library, playlist editor, programs page, themes page, and scheduler page.
- `player`: React, TypeScript, Vite fullscreen-friendly local image/video playback shell with optional virtual-canvas theme rendering.
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
- `GET http://localhost:3000/api/playlists`
- `POST http://localhost:3000/api/playlists`
- `PUT http://localhost:3000/api/playlists/:id`
- `DELETE http://localhost:3000/api/playlists/:id`
- `GET http://localhost:3000/api/programs`
- `POST http://localhost:3000/api/programs`
- `PUT http://localhost:3000/api/programs/:id`
- `DELETE http://localhost:3000/api/programs/:id`
- `GET http://localhost:3000/api/scheduler`
- `PUT http://localhost:3000/api/scheduler`
- `GET http://localhost:3000/api/themes`
- `POST http://localhost:3000/api/themes`
- `PUT http://localhost:3000/api/themes/:id`
- `DELETE http://localhost:3000/api/themes/:id`
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

The legacy default playlist is stored in:

```text
server/data/playlist.json
```

Reusable playlist records are stored in:

```text
server/data/playlists.json
```

Programs, themes, and scheduler blocks are stored in:

```text
server/data/programs.json
server/data/themes.json
server/data/scheduler.json
```

`GET /api/schedule` is generated from the active scheduler block. The active block selects a program and optionally a theme. The program expands to playlists in order, and those playlist media items become the local player schedule. The theme is included as metadata so the player can render the content into a virtual layout frame. If no scheduler blocks exist, the server falls back to the legacy default playlist path. If no playlist exists, the server falls back to the static example schedule.

Default theme fallback:

- `Default Fullscreen`
- Landscape
- 1920 x 1080 virtual canvas
- Black background
- One program region covering the full canvas

The player scales the virtual canvas to the actual screen. Physical display resolution is not hard-coded.

Theme layouts are stored as a generic `regions[]` collection. The dashboard editor currently supports Program, Logo, Image, and Text regions. Logo and Image regions use image files from the Media Library. Text regions render static text only.

Player rendering order is:

1. Background
2. Image regions
3. Logo regions
4. First Program Region
5. Text regions

Static region media is synced to the player cache through the existing agent media sync path.

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
- A Media Library page for image/video upload, thumbnail preview, refresh, and delete.
- A Playlists page for adding media, removing items, setting duration, reordering with up/down buttons, and saving the default playlist.
- A Programs page for creating programs and ordering playlists inside each program.
- A Themes page with a visual region designer, Layers panel, canvas controls, region properties, Program Region editing, and static Logo/Image/Text regions.
- A Scheduler page for assigning programs and themes to date, day, and time blocks.

Media upload limits:

- Images: 20 MB.
- Videos: 500 MB.

Supported media types:

- Images: `jpg`, `jpeg`, `png`, `webp`.
- Videos: `mp4`, `webm`.

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
4. Upload an image or video with the file picker.
5. Confirm the media appears in the media library with preview, filename, type, and size.
6. Confirm the file exists in `server/public/media/`.
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

## Test Program Scheduling

Programs sit between playlists and the scheduler:

```text
Media -> Playlist -> Program -> Theme -> Scheduler Block -> Screen -> Player
```

1. Start the server.
2. Confirm `GET http://localhost:3000/api/schedule` still works with only the default playlist.
3. Create or save playlists.
4. Open Programs and create a program.
5. Add one or more playlists to the program and save.
6. Open Scheduler and add a block for the program.
7. Set a time window that includes the current local time and save.
8. Confirm `GET http://localhost:3000/api/schedule` contains the program playlists flattened in program order.
9. Change the scheduler block to a time or day that is inactive.
10. Confirm `GET http://localhost:3000/api/schedule` returns `items: []` and the player shows `Playlist is empty` after agent sync.

## Test Theme Layout Frames

Themes are virtual canvas layout frames. Coordinates are stored in virtual canvas units, not physical screen pixels.

1. Start the server.
2. Open Themes and confirm `Default Fullscreen` exists.
3. Select the Program Region in the Layers panel.
4. Move and resize the region on the canvas.
5. Rename the region in Properties and confirm the Layers panel updates.
6. Use alignment controls such as Center H, Center V, and Match Canvas.
7. Duplicate the Program Region and confirm the last Program Region cannot be deleted.
8. Add a Logo Region, select an image from the Media Library, and save.
9. Add an Image Region, select an image from the Media Library, choose object fit, and save.
10. Add a Text Region, enter text, style it, and save.
11. Refresh Themes and confirm all regions are restored from JSON.
12. Open Scheduler and assign the custom theme to an active program block.
13. Confirm `GET http://localhost:3000/api/schedule` includes `theme` metadata and the existing `items` array.
14. Start the agent and confirm it writes the enhanced `schedule.json` and caches static region image files.
15. Start the player and confirm media renders in this order: background, images, logos, program, text.
16. Stop the server.
17. Confirm cached playback continues from the local enhanced schedule.

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
