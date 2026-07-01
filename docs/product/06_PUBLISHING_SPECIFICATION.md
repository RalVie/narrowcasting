# Narrowcasting Publishing Specification

- **Document ID:** PRODUCT-006
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the publishing model of the Narrowcasting platform.

Publishing is the process that transforms business intent into runtime behaviour.

Publishing does NOT directly control playback.

Publishing produces validated business information.

Runtime playback remains the responsibility of the Scheduler Resolver.

## 2. Publishing Philosophy

Publishing should always answer:

```text
What will happen
->

```

```text
Where will it happen
->

```

```text
When will it happen
->

```

```text
Why will it happen
->

```

```text
Can I safely continue
->

```

Publishing must never surprise the operator.

## 3. Publishing Flow

```text
Media

->

Playlist

->

Program

->

Campaign

->

Validation

->

Preview

->

Publish

->

Scheduler Resolver

->

Player
```

Only the last two steps are runtime.

Everything before that is business logic.

## 4. Publishing States

Every publication exists in one of four states.

```text
Editing

->

Validation

->

Ready

->

Published
```

The user should always know the current state.

## 5. Validation

Validation is mandatory.

The platform SHALL validate:

Missing media

Empty playlists

Empty programs

Missing theme

Invalid schedule

Invalid campaign priority

Missing targets

Invalid screen references

Offline destinations

Cache warnings

Storage warnings

Validation results are grouped as:

Critical

Warning

Information

Critical errors block publishing.

## 6. Preview

Every publication SHALL support preview.

Preview answers:

```text
"What will the selected screen display
->
"
```

Inputs:

Screen

Group

Date

Time

Outputs:

Winning campaign

Program

Playlist

Theme

Reason

Resolver explanation

Preview uses the Scheduler Resolver.

Preview never duplicates scheduling logic.

## 7. Publish Confirmation

Before publishing the operator sees:

Campaign

->

Targets

->

Schedule

->

Expected impact

->

Warnings

->

Confirmation

This screen prevents accidental deployment.

## 8. Publish Impact

Impact analysis SHALL include:

Affected Screens

Affected Groups

Affected Locations (future)

Campaign Priority

Activation Time

Expiration Time

Existing Active Campaigns

Potential Conflicts

## 9. Publishing Safety

Publishing SHALL never overwrite live data silently.

If a publication affects existing content, the operator is informed.

Examples:

Replacing live campaign.

Campaign overlap.

Target overlap.

Priority conflict.

Schedule overlap.

## 10. Scheduler Relationship

Publishing does not choose playback.

Publishing produces business intent.

The Scheduler Resolver evaluates:

Time Windows

Valid Candidates

Campaign Priority

Deterministic Tie-Breaking

The Scheduler Resolver remains the only runtime authority.

## 11. Preview Simulator

The simulator SHALL answer:

"What happens if..."

Examples:

Tomorrow 09:00

Friday evening

Christmas Day

Screen 12

Group Lobby

Simulation SHALL execute the normal Scheduler Resolver.

No simulation-specific logic is allowed.

## 12. Publish History

Every publication creates an immutable event.

Recorded:

User

Timestamp

Campaign

Revision

Targets

Validation Result

History is never edited.

## 13. Rollback

Rollback restores a previous published revision.

Rollback SHALL:

Preserve history

Create a new revision

Trigger validation

Require confirmation

Rollback never modifies historical events.

## 14. Conflict Detection

Future releases SHALL detect:

Campaign overlap

Priority conflicts

Target conflicts

Schedule collisions

Content dependency conflicts

The system should propose corrective actions where possible.

## 15. Notifications

Successful publish:

Campaign published successfully.

Warnings:

Campaign published with warnings.

Errors:

Publishing blocked.

All notifications SHALL link to relevant details.

## 16. Permissions

Future permission model:

Content Manager

Create

Edit

Campaign Manager

Publish

Operator

Pause

Resume

Diagnose

Administrator

Override

Archive

Rollback

Delete

Publishing permissions SHALL be configurable.

## 17. Enterprise Requirements

Publishing SHALL support:

Single screen

Screen groups

Future locations

Hundreds of campaigns

Thousands of screens

Bulk publishing SHALL become available.

## 18. Future Extensions

Reserved:

Approval workflows

Multi-stage approval

Scheduled publishing

Emergency publishing

Blue/Green deployment

Content freeze windows

Campaign templates

Publish checklists

## 19. Requirements

**REQ-PUB-001**

Publishing SHALL validate before activation.

**REQ-PUB-002**

Publishing SHALL provide preview.

**REQ-PUB-003**

Publishing SHALL analyse impact.

**REQ-PUB-004**

Publishing SHALL preserve history.

**REQ-PUB-005**

Publishing SHALL support rollback.

**REQ-PUB-006**

Publishing SHALL never bypass the Scheduler Resolver.

**REQ-PUB-007**

Publishing SHALL remain a business workflow.

## 20. Definition of Done

Publishing is considered complete when:

- Validation exists.

- Preview exists.

- Publish impact is visible.

- Rollback exists.

- History exists.

- Scheduler Resolver remains authoritative.

- Users understand what will happen before publication.

## Relationship with Other Specifications

PRODUCT-005 defines the Campaign lifecycle.

This document defines how campaigns become active.

The Scheduler Resolver remains responsible for runtime playback.

---

## Document Navigation

- **Previous:** 05_CAMPAIGN_LIFECYCLE.md
- **Next:** 07_MONITORING_AND_OPERATIONS.md
- **Related specifications:** 05_CAMPAIGN_LIFECYCLE.md, 12_PREVIEW_AND_SIMULATION.md, ../architecture/ARCHITECTURE.md
