# Narrowcasting Offline & Synchronization Specification

- **Document ID:** PRODUCT-009
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how the Narrowcasting platform behaves when communication between the server and players is interrupted.

Offline operation is not an exception.

Offline operation is a fundamental design principle.

The platform SHALL continue operating safely when the network is unavailable.

## 2. Product Philosophy

The player is autonomous.

The server is authoritative.

The player continues playback using the last valid resolved schedule.

Synchronization restores consistency once connectivity returns.

Users should never wonder:

```text
Is this player offline
->

```

```text
Is it still playing
->

```

```text
Is it synchronized
->

```

```text
Does it need attention
->

```

## 3. Synchronization Model

```text
Business Objects

->

Scheduler Resolver

->

Resolved Schedule

->

Synchronization

->

Player Cache

->

Playback
```

Synchronization never bypasses the Scheduler Resolver.

Players never receive Campaigns directly.

Players receive resolved schedules.

## 4. Offline Principles

OFF-001

Playback continues.

OFF-002

No content disappears because connectivity is lost.

OFF-003

Last valid schedule remains active.

OFF-004

Synchronization resumes automatically.

OFF-005

Operators are informed.

## 5. Synchronization States

Every player always has one synchronization state.

Pending

Downloading

Up To Date

Out Of Sync

Offline

Synchronization Failed

Unknown

Only one state may be active.

## 6. Cache Philosophy

Every player owns its own media cache.

The cache is responsible for:

Downloaded media

Resolved schedule

Playback continuity

Future cleanup

The cache is not user-editable.

Dynamic content has different offline behavior:

- Uploaded images and videos are cached locally before schedule activation.
- Web URL items require network access from the Player at playback time.
- Web URL Browser renderer mode also requires the local Chromium kiosk and Agent browser renderer control path on the Player appliance.
- RSS Feed content is fetched and resolved by the server before it reaches the Player.
- RSS item images may depend on the remote source unless later cached by a future media-cache phase.

If a remote Web URL or RSS image is unavailable during playback, the Player should fail safely and continue with the next resolved item where possible.

## 7. Cache Health

Every player reports:

Cache Size

Available Space

Missing Media

Corrupt Media

Pending Downloads

Pending Cleanup

Last Validation

## 8. Synchronization Process

Normal flow:

```text
Campaign Published

->

Scheduler Resolver

->

Resolved Schedule

->

Player detects update

->

Downloads required media

->

Validates cache

->

Activates schedule
```

Activation only occurs after validation succeeds.

## 9. Synchronization Validation

Before activation:

Resolved schedule downloaded

Referenced media exists

Media integrity verified (future)

Storage available

Theme available

Cache valid

Only then:

Schedule becomes active.

## 10. Offline Behaviour

When connection is lost:

Player continues playback.

No media is deleted.

No schedule is discarded.

Operator receives an informational state.

No emergency action is required.

## 11. Recovery

When communication returns:

Player contacts server.

Checks schedule version.

Downloads differences.

Performs validation.

Activates new schedule.

Logs synchronization.

## 12. Player Device Identity Recovery

If a player discovers that its registered screen identity no longer exists, it resets only its Narrowcasting device credentials.

If its device secret is invalid or expired, it also resets only its device credentials.

The player preserves:

- media cache
- schedule cache
- stable player id

After reset, the player automatically rediscovers the server and registers again as Pending Approval.

Temporary network failures, server outages, or unreachable endpoints must not reset identity.

## 13. Failed Synchronization

Failures include:

Server unavailable

Download failure

Storage full

Invalid media

Schedule validation failed

Network interruption

Player remains operational using previous schedule whenever possible.

## 14. Synchronization Dashboard

Operators should immediately see:

Online Players

Offline Players

Pending Synchronizations

Synchronization Failures

Cache Warnings

Storage Warnings

## 15. Player Status

Each player exposes:

Online Status

Last Seen

Schedule Version

Synchronization State

Cache Health

Storage Health

Software Version

Last Successful Sync

## 16. Storage Behaviour

Warnings:

80%

90%

95%

Critical:

100%

Before storage exhaustion the system recommends:

Cleanup

Archive

Media pruning

Future automatic cleanup.

## 17. Cache Cleanup

Media cleanup must never remove media referenced by:

Current schedule

Pending schedule

Validation process

Cleanup is validation-aware.

## 18. Conflict Handling

If synchronization fails:

Player continues existing playback.

Alert created.

Diagnostics updated.

Activity logged.

Operator notified.

## 19. Requirements

**REQ-OFF-001**

Players SHALL continue operating while offline.

**REQ-OFF-002**

Synchronization SHALL be automatic.

**REQ-OFF-003**

Synchronization SHALL validate before activation.

**REQ-OFF-004**

Cache cleanup SHALL never remove referenced media.

**REQ-OFF-005**

Synchronization failures SHALL generate alerts.

**REQ-OFF-006**

Offline players SHALL remain visible.

**REQ-OFF-007**

Player state SHALL always be explainable.

**REQ-OFF-008**

Synchronization SHALL never bypass the Scheduler Resolver.

## 20. Enterprise Scale

Synchronization shall support:

Single Player

->

10 Players

->

100 Players

->

1000 Players

->

Multiple Installations

Future:

Bandwidth throttling

Regional synchronization

Delta synchronization

Prioritized deployments

## 21. Future Extensions

Reserved:

Peer-to-peer distribution

Edge synchronization

Checksum validation

Background optimization

Smart cache eviction

Predictive downloads

Bandwidth scheduling

Package compression

## 22. Definition of Done

Offline & Synchronization is complete when:

- Players survive network outages.

- Playback never stops unexpectedly.

- Synchronization is automatic.

- Validation protects activation.

- Cache remains healthy.

- Operators understand synchronization state.

- Scheduler Resolver remains authoritative.

## Relationship with Other Specifications

PRODUCT-001

Defines Local First philosophy.

PRODUCT-006

Defines Publishing.

PRODUCT-007

Defines Monitoring.

This document defines how resolved schedules safely reach the player.

---

## Document Navigation

- **Previous:** 08_ROLES_AND_PERMISSIONS.md
- **Next:** 10_ALERTS_AND_INCIDENTS.md
- **Related specifications:** 06_PUBLISHING_SPECIFICATION.md, 07_MONITORING_AND_OPERATIONS.md, ../architecture/ARCHITECTURE.md
