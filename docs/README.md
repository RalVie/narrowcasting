# Narrowcasting Phase 0

Local-first Raspberry Pi digital signage foundation.

## Boundaries

- Playback is always local.
- Management is optional.
- Media must be cached locally before playback.
- Players must continue when the server, internet, or network is offline.
- MQTT is not implemented yet, but player and agent code leave room for urgent commands later.
- No authentication, uploads, scheduling engine, Cloudflare setup, systemd services, or commercial multi-tenant features yet.

## Parts

- `server`: Node.js, TypeScript, Fastify, health endpoint, and SQLite-ready structure.
- `dashboard`: React, TypeScript, Vite management shell with placeholder pages.
- `player`: React, TypeScript, Vite fullscreen-friendly local playback shell.
- `agent`: Node.js, TypeScript config loader, sync loop placeholder, and heartbeat placeholder.

## Install

Install dependencies per part:

```bash
cd server && npm install
cd ../dashboard && npm install
cd ../player && npm install
cd ../agent && npm install
```

## Development

Run each part in its own terminal:

```bash
cd server
npm run dev
```

```bash
cd dashboard
npm run dev
```

```bash
cd player
npm run dev
```

```bash
cd agent
npm run dev
```

Default development ports:

- Server: `http://localhost:3000/health`
- Dashboard: `http://localhost:5173`
- Player: `http://localhost:5174`

## Build

```bash
cd server && npm run build
cd ../dashboard && npm run build
cd ../player && npm run build
cd ../agent && npm run build
```
