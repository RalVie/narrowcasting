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