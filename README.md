# Narrowcasting

Narrowcasting is a commercial digital signage platform for managing media, campaigns, screens and player appliances. It is designed for Raspberry Pi based deployments where playback must remain stable, local and recoverable even when network connectivity is unreliable.

The platform combines a server-side scheduling and publishing workflow with dedicated player appliances that synchronize resolved schedules, cache media locally and recover automatically during unattended operation.

## Features

### Core Platform

- Image and video media
- Campaigns, programs, playlists and themes
- Screen registration and screen groups
- Assignment-based publishing
- Scheduler Resolver as the authoritative schedule decision engine

### Dynamic Content

- Web URL media
- RSS Feed media
- Server-side RSS resolution into player-ready schedule items

### Browser Rendering

- Embedded iframe rendering for embeddable websites
- Browser Renderer for kiosk display of non-iframe websites
- Browser Automation with WAIT, CLICK and REFRESH actions
- Persistent Browser Sessions for long-running dashboards

### Player

- Offline schedule and media cache
- Media synchronization through the Agent
- Automatic screen registration
- Device identity recovery and re-registration
- Runtime recovery and watchdog support

### Deployment

- Server Appliance installation
- Player Appliance installation
- Bootstrap Installer
- Appliance Manager
- Update, Repair and Uninstall flows

## Architecture

Narrowcasting is organized into four high-level layers:

- Business Layer: media, playlists, programs, campaigns and themes.
- Deployment Layer: screens and screen groups.
- Runtime Layer: assignments, Scheduler Resolver and resolved schedules.
- Player Layer: player, agent, offline cache, synchronization and runtime recovery.

The Scheduler Resolver remains the single authority for deciding what a screen should display. Players render resolved schedules only. The Agent owns synchronization, Browser Renderer control and local runtime recovery.

## Quick Start

Fresh Raspberry Pi installation:

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://raw.githubusercontent.com/RalVie/narrowcasting/main/scripts/bootstrap.sh | bash
```

The bootstrap script installs minimal prerequisites, clones or updates the repository and launches the Narrowcasting Appliance Manager.

## Appliance Manager

The Appliance Manager is started with:

```bash
./scripts/install.sh
```

It supports:

- Install Server
- Install Player
- Update Installation
- Repair Installation
- Uninstall

## Documentation

- Product specification: [docs/product/](docs/product/)
- Implementation contracts: [docs/implementation/](docs/implementation/)
- Deployment documentation: [docs/deployment/](docs/deployment/)
- Architecture documentation: [docs/architecture/](docs/architecture/)

## Supported Hardware

Current supported production target:

- Raspberry Pi 5
- Debian 13 / Raspberry Pi OS based on Debian 13

## Current Product Version

This repository reflects Narrowcasting Product 1.3.

Product 1.3 includes Dynamic Content, Browser Renderer, Browser Automation, Persistent Browser Sessions and the Player Runtime Watchdog.

## Project Status

Product 1.3 is stable and currently in customer pilot / stabilization.

## Contributing

External contributions are currently by invitation only unless otherwise agreed in writing with Proworks Media Factory.

## License

This repository contains proprietary commercial software.

Copyright © 2026 Proworks Media Factory. All Rights Reserved.

See [LICENSE](LICENSE) for details.
