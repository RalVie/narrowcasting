# Production Update Script Plan

This document defines the planned production update script. It is a plan only; the script is not implemented yet.

## Planned Script

```text
scripts/update-production.sh
```

## Update Flow

The update script should:

1. Detect the current repository path.
2. Confirm the target environment.
3. Backup production data before changes.
4. Run `git pull`.
5. Install or refresh dependencies.
6. Build server, dashboard, agent, and player.
7. Restart affected services.
8. Verify service status and health endpoints.

## Backup Requirements

Before update, back up:

- server data;
- media metadata;
- campaign, assignment, screen, and group stores;
- audit data;
- player schedule cache;
- relevant local config.

The update process must not delete production data.

## Safety Requirements

- Do not overwrite config without confirmation.
- Do not remove media or cache directories.
- Be idempotent where practical.
- Support dry-run mode if practical.
- Stop on failed build before restarting services.
- Report every service restarted.

## Service Restart Order

Recommended order:

1. Server.
2. Agent.
3. Player server.
4. Kiosk only if needed.

The player must continue using local cached playback inputs if server or update steps fail.

## Verification

After update, verify:

- `http://localhost:3000/api/status`
- `http://localhost:3000/`
- `http://localhost:4174/player`
- systemd service status
- recent server and agent logs

Rollback and release history are future deployment topics.
