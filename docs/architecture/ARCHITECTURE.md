# Narrowcasting Architecture

## Core Principles

Playback is always local.
Management is optional.

## Modes

1. Server + Client
2. Client Only
3. Server Only

## Media

Uploaded image and video media is cached locally before playback.

Dynamic media may have different runtime requirements:

- Web URL content is resolved into schedule items and rendered by iframe or Browser Renderer.
- RSS Feed content is fetched and resolved server-side before reaching the Player.
- Remote Web URLs and RSS item images may require network access at playback time.

## Content Flow

```text
Business Layer
Media -> Playlist -> Program -> Campaign -> Theme

Deployment Layer
Screen -> Screen Group

Runtime Layer
Assignment -> Scheduler Resolver -> Resolved Schedule

Player Layer
Agent -> Offline Cache -> Player
```

Playlists define ordered media.
Programs define ordered playlists.
Campaigns express business publishing intent.
Themes define a virtual canvas and layout regions.
Assignments bind business intent to deployment targets.
The Scheduler Resolver is the only runtime authority that produces the Resolved Schedule consumed by the Player.
The Agent owns synchronization, Browser Renderer control, Browser Automation execution, and local runtime recovery/watchdog behavior.

## Themes

Themes use virtual canvas coordinates, for example:

- Landscape Full HD: 1920 x 1080
- Portrait Full HD: 1080 x 1920

The player scales the virtual canvas to the real display. Physical display resolution must not be hard-coded.

`Default Fullscreen` is the safe fallback theme. It uses a 1920 x 1080 landscape canvas with one full-canvas program region, preserving existing fullscreen playback.

Themes store layout as a generic `regions[]` collection. The dashboard Theme Designer edits those regions through a reusable visual framework with a Layers panel, canvas selection, and a Properties panel.

Transparent colors are stored as the string `transparent`. Existing hex colors such as `#000000` remain valid and continue to load normally.

Supported region types:

- Program: renders the active playlist/program content.
- Logo: renders a static image, including PNG transparency.
- Image: renders a static image.
- Text: renders static text.
- Clock: renders local player time and updates live without server access.

Future region types such as ticker, weather, QR code, video regions, emergency overlays, or dedicated feed/ticker regions remain extension points.

Player rendering order is:

1. Theme background
2. Image regions
3. First Program Region
4. Logo regions
5. Text regions
6. Clock regions

The player remains intentionally simple. It consumes the saved theme JSON, renders static regions from local cached media, and renders Clock regions from local player time. Program playback remains the same as before.

## Synchronization

Normal updates use pull-sync.

Future urgent commands may use MQTT.

## Offline Behavior

A client must continue playing when:

- Server is offline
- Internet is offline
- Network is offline

## Setup

A client can expose a setup hotspot when no known network is available.

## Management

Management may be performed:

- Locally
- Through hotspot
- Through remote tunnel (Cloudflare/Tailscale)

Playback must never stop because management is unavailable.
