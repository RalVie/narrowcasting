# Narrowcasting Architecture

## Core Principles

Playback is always local.
Management is optional.

## Modes

1. Server + Client
2. Client Only
3. Server Only

## Media

All media is cached locally before playback.

## Content Flow

```text
Media -> Playlist -> Program -> Theme -> Scheduler Block -> Screen -> Player
```

Playlists define ordered media.
Programs define ordered playlists.
Themes define a virtual canvas and layout regions.
Scheduler blocks choose the active program and optional theme.

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

Future region types such as ticker, weather, RSS, QR code, video regions, and emergency overlays remain extension points.

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
