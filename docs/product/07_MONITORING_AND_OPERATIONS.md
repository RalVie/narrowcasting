# Narrowcasting Monitoring & Operations Specification

- **Document ID:** PRODUCT-007
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how operators monitor the health of the Narrowcasting platform.

Monitoring is an operational activity.

Monitoring never modifies business objects.

Its responsibility is to answer:

```text
Is the platform healthy
->

```

```text
What requires attention
->

```

```text
Why is something wrong
->

```

```text
What should I do next
->

```

## 2. Operational Philosophy

Monitoring should prevent surprises.

Operators should discover problems before end users do.

Monitoring is therefore proactive rather than reactive.

## 3. Monitoring Workspaces

Monitoring consists of four areas.

```text
Live Status

->

Alerts

->

Diagnostics

->

Activity Log
```

Each area has one responsibility.

## 4. Live Status

## Purpose

Provide a real-time overview of the platform.

Shows

Players

Screens

Campaigns

Synchronization

Storage

Connectivity

Server Health

Player Health

No editing is performed here.

Primary action:

Investigate.

## 5. Live Status Dashboard

The first screen should answer:

```text
How many players are online
->

```

```text
How many screens have warnings
->

```

```text
How many critical alerts exist
->

```

```text
Are campaigns publishing correctly
->

```

```text
Is storage healthy
->

```

Recommended widgets

```text
Platform Health

Players Online

Critical Alerts

Warnings

Current Campaigns

Pending Synchronisations

Storage Usage

Last Deployments
```

## 6. Player Health

Every player reports:

Online

Offline

Last Seen

Software Version

CPU

Memory

Temperature

Disk Usage

Cache Status

Network Quality

## Future

Screenshot

Current Media

## 7. Screen Health

Every screen has a health state.

Healthy

Warning

Critical

Offline

Unknown

Health is calculated from multiple indicators.

## 8. Alerts

Alerts are first-class objects.

Alerts are not notifications.

Notifications disappear.

Alerts remain until resolved.

## 9. Alert Severity

Four levels exist.

Critical

Platform no longer functions correctly.

## Examples

Player offline.

Storage full.

Resolver failure.

Warning

Attention required soon.

## Examples

Cache almost full.

Campaign expires tomorrow.

Synchronization delayed.

Information

Operational information.

## Examples

New player registered.

Campaign published.

Resolved

Historical alert.

Visible only in history.

## 10. Alert Lifecycle

```text
Created

->

Acknowledged

->

Investigating

->

Resolved

->

Archived
```

Every transition is recorded.

## 11. Alert Ownership

Each alert may be assigned.

Assigned To

Owner

Created

Resolved

Resolution Notes

Future:

Escalation.

## 12. Diagnostics

## Purpose

Explain behaviour.

Diagnostics never changes runtime.

Diagnostics always answers

```text
Why
->

```

## Examples

```text
Why is this campaign active
->

```

```text
Why was another campaign rejected
->

```

```text
Why is the player offline
->

```

## 13. Scheduler Diagnostics

Scheduler Diagnostics visualises

Resolver Summary

Winning Candidate

Candidate Timeline

Rejection Reasons

Priority

Schedule Evaluation

Resolver Trace

Raw JSON (collapsed)

Diagnostics remain read-only.

## 14. Activity Log

## Purpose

Provide a chronological operational history.

Every significant action is recorded.

## Examples

Campaign Published

Campaign Paused

Player Registered

Screen Approved

Media Deleted

Playlist Updated

Resolver Error

Storage Warning

## 15. Activity Event

Every event records

Timestamp

User

Object

Object Type

Action

Result

Description

Correlation ID (future)

## 16. Operational Timeline

Operators should understand what happened.

Example

```text
10:15

Campaign Published

->

10:17

Player Downloaded Media

->

10:18

Campaign Active

->

10:19

Player Offline

->

10:20

Alert Created
```

## 17. Offline Behaviour

Offline operation is expected.

The platform distinguishes

Online

Offline

Disconnected

Unknown

Pending Synchronisation

Synchronization Failed

These states are visible everywhere.

## 18. Storage Monitoring

Monitor

Server Storage

Player Storage

Cache Size

Available Space

Cleanup Status

Warnings begin before storage is exhausted.

## 19. Cache Monitoring

Every player exposes

Cache Size

Pending Downloads

Pending Cleanup

Failed Downloads

Missing Media

Cache Validation

## Future

Media Verification

Checksum Validation

## 20. Operational Requirements

**REQ-OPS-001**

Every operational problem SHALL produce an alert.

**REQ-OPS-002**

Every alert SHALL have a severity.

**REQ-OPS-003**

Every alert SHALL have a lifecycle.

**REQ-OPS-004**

Every operational action SHALL appear in the Activity Log.

**REQ-OPS-005**

Diagnostics SHALL remain read-only.

**REQ-OPS-006**

Monitoring SHALL never duplicate business workflows.

**REQ-OPS-007**

Every player SHALL expose health information.

**REQ-OPS-008**

Storage SHALL be monitored continuously.

**REQ-OPS-009**

Synchronization state SHALL always be visible.

## 21. Enterprise Scale

Monitoring shall support

1 player

->

10 players

->

100 players

->

1000 players

->

Multiple installations

Therefore monitoring shall support

Search

Filters

Saved Views

Health Rollups

Bulk Selection

Grouping

Locations

Future:

Maps

Heatmaps

Fleet Management

## 22. Future Extensions

Reserved

Incident Management

Maintenance Windows

Automatic Recovery

Remote Restart

Remote Update

Player Screenshot

Performance Analytics

Predictive Failure Detection

Notifications Center

Service Integrations

## 23. Definition of Done

Monitoring is complete when

- Operators immediately know system health.

- Problems are prioritised.

- Every alert is traceable.

- Diagnostics explains behaviour.

- Activity history is complete.

- Offline behaviour is visible.

- Enterprise scale is supported.

## Relationship with Other Specifications

PRODUCT-001

Defines product philosophy.

PRODUCT-002

Defines workspace ownership.

PRODUCT-003

Defines UX principles.

PRODUCT-004

Defines Monitoring workspace.

PRODUCT-005

Defines Campaign lifecycle.

PRODUCT-006

Defines Publishing.

This document defines operational behaviour.

---

## Document Navigation

- **Previous:** 06_PUBLISHING_SPECIFICATION.md
- **Next:** 08_ROLES_AND_PERMISSIONS.md
- **Related specifications:** 09_OFFLINE_AND_SYNCHRONIZATION.md, 10_ALERTS_AND_INCIDENTS.md, 11_ACTIVITY_LOG_AND_AUDIT.md
