# Narrowcasting Activity Log & Audit Specification

- **Document ID:** PRODUCT-011
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how the Narrowcasting platform records, presents and preserves operational history.

The Activity Log answers:

```text
What happened
->

```

```text
When did it happen
->

```

```text
Who performed the action
->

```

```text
Why did it happen
->

```

```text
What was affected
->

```

The Audit Log answers:

```text
Can we prove what happened
->

```

```text
Can history be trusted
->

```

```text
Can changes be traced
->

```

Activity and Audit are related but have different purposes.

## 2. Philosophy

The platform should never leave operators wondering:

```text
"Who changed this
->
"
```

or

```text
"When did this stop working
->
"
```

Every significant action is recorded.

History is a first-class feature.

## 3. Activity Log

## Purpose

Operational awareness.

Activity Log is chronological.

Newest events first.

## Examples

Campaign Published

Player Registered

Media Uploaded

Playlist Updated

Program Saved

Screen Approved

Synchronization Completed

Alert Created

Player Offline

Storage Warning

## 4. Audit Log

## Purpose

Accountability.

Audit records cannot be modified.

Audit history survives:

updates

rollbacks

archiving

database migrations

future cloud synchronization

## 5. Event Categories

Content

Publishing

Deployment

Monitoring

Administration

Security

Synchronization

Storage

System

## 6. Event Model

Every event contains

Event ID

Timestamp

Category

Severity

Object Type

Object ID

Object Name

Action

Result

User

Description

Source

Correlation ID (future)

Metadata

## 7. Severity

Information

Warning

Critical

Audit

Audit events are never hidden.

Product 1.0 implementation note:

The Audit workspace supports newest-first review, search, and simple client-side filters for All, Action, Screen, Campaign, and User/System views.

## 8. Object History

Every object exposes its own history.

Example

Campaign

->

## History

Created

->

Edited

->

Validated

->

Published

->

Paused

->

Resumed

->

Archived

The same principle applies to

Media

Playlists

Programs

Screens

Screen Groups

Themes

Users

## 9. User History

Every user has an activity history.

## Examples

Published Campaign

Deleted Playlist

Approved Screen

Resolved Alert

Restarted Player

Changed Settings

This improves accountability.

## 10. Timeline View

Every object supports a timeline.

Example

```text
09:15

Campaign Created

->

09:25

Validated

->

09:32

Published

->

09:35

Player Downloaded

->

09:37

Campaign Live

->

09:41

Player Offline
```

The operator immediately understands the sequence of events.

## 11. Correlation

Future versions should group related events.

Example

Campaign Publish

->

Synchronization

->

Player Download

->

Schedule Activated

->

Playback Started

One action.

Multiple events.

Single timeline.

## 12. Search

Activity Log supports

Search

Date Range

User

Object

Category

Severity

Location (future)

Installation (future)

## 13. Retention

Activity data

Configurable retention.

Audit data

Never deleted automatically.

Archive preferred over deletion.

## 14. Export

## Future

CSV

JSON

PDF

SIEM

Syslog

API

Exports preserve timestamps and identifiers.

## 15. Audit Rules

Every privileged action records

Who

What

When

Where

Result

Administrative actions always create audit entries.

## 16. Security

Audit records

Cannot be edited.

Cannot be reordered.

Cannot be silently removed.

Future:

Tamper detection.

Digital signatures.

## 17. Relationship to Monitoring

Monitoring answers

```text
"What is happening
->
"
```

Activity answers

```text
"What happened
->
"
```

Audit answers

```text
"Can we prove it happened
->
"
```

These concepts remain separate.

## 18. Enterprise Scale

Support

Millions of events

Fast search

Incremental loading

Background indexing

Retention policies

Archived history

## Future

Distributed event storage.

## 19. Requirements

**REQ-AUD-001**

Every significant action SHALL create an Activity event.

**REQ-AUD-002**

Administrative actions SHALL create Audit events.

**REQ-AUD-003**

Audit records SHALL be immutable.

**REQ-AUD-004**

Every business object SHALL expose its own history.

**REQ-AUD-005**

Activity SHALL support search and filtering.

**REQ-AUD-006**

Timeline views SHALL present chronological order.

**REQ-AUD-007**

Correlation SHALL be supported in future versions.

## 20. Future Extensions

Reserved

Version comparison

Object diff viewer

Restore previous revision

Cross-system audit

Cloud synchronization

Compliance reports

Security auditing

## 21. Definition of Done

Activity & Audit is complete when

- Every important action is recorded.

- Every object has history.

- Audit records cannot be modified.

- Operators understand what happened.

- Administrators can investigate historical events.

- Enterprise scale is supported.

## Relationship with Other Specifications

PRODUCT-005

Campaign Lifecycle

PRODUCT-007

Monitoring

PRODUCT-010

Alerts & Incidents

This document defines historical accountability across the platform.

---

## Document Navigation

- **Previous:** 10_ALERTS_AND_INCIDENTS.md
- **Next:** 12_PREVIEW_AND_SIMULATION.md
- **Related specifications:** 05_CAMPAIGN_LIFECYCLE.md, 07_MONITORING_AND_OPERATIONS.md, 10_ALERTS_AND_INCIDENTS.md
