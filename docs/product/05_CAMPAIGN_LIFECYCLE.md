# Narrowcasting Campaign Lifecycle Specification

- **Document ID:** PRODUCT-005
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the complete lifecycle of a Campaign.

A Campaign is the primary business object responsible for publishing content.

Campaigns are the only object that expresses business intent.

The Scheduler Resolver determines runtime playback.

Campaigns never directly control the player.

## 2. Campaign Philosophy

A Campaign is never simply "edited".

Instead it progresses through a controlled lifecycle.

The lifecycle guarantees:

predictable publishing

validation

rollback

auditability

operational safety

## 3. Lifecycle

```text
Draft

->

Ready

->

Scheduled

->

Live

->

Paused

->

Expired

->

Archived
```

Every transition is validated.

## 4. Draft

## Purpose

Work in progress.

## Characteristics

- Editable

- Not visible to players

- No Resolver participation

- No publishing

## Allowed actions

Edit

Duplicate

Delete

Validate

Publish Request

## 5. Ready

## Purpose

Validated.

Waiting for publication.

## Requirements

Program exists

Targets exist

Schedule valid

Media valid

Theme valid

## Allowed actions

Publish

Return to Draft

Duplicate

Archive

## 6. Scheduled

## Purpose

Approved for future publication.

## Characteristics

Visible in Calendar.

Not yet active.

Resolver ignores campaign until schedule becomes active.

## Allowed actions

Pause

Cancel Schedule

Return to Draft

Duplicate

Preview

## 7. Live

## Purpose

Currently active.

## Characteristics

Campaign may participate in Scheduler Resolver.

Actual playback still depends on:

Priority

Schedule

Resolver

Assignments

## Allowed actions

Pause

Duplicate

Create Revision

Preview

View Diagnostics

## 8. Paused

## Purpose

Temporarily disabled.

## Characteristics

Ignored by Resolver.

History preserved.

## Allowed actions

Resume

Archive

Duplicate

## 9. Expired

## Purpose

Campaign reached end of schedule.

## Characteristics

Read-only.

No Resolver participation.

## Allowed actions

Duplicate

Archive

Restore as Draft

## 10. Archived

## Purpose

Historical record.

## Characteristics

Hidden by default.

Never participates in publishing.

## Allowed actions

Restore

Duplicate

Permanent Delete (optional policy)

## 11. Lifecycle Rules

**REQ-CMP-001**

Every campaign SHALL have exactly one lifecycle state.

**REQ-CMP-002**

Only Ready campaigns may be scheduled.

**REQ-CMP-003**

Only Scheduled campaigns may automatically become Live.

**REQ-CMP-004**

Only Live campaigns may participate in runtime resolution.

**REQ-CMP-005**

Archived campaigns SHALL never become active.

## 12. Publish Validation

Before publication the system SHALL validate:

Program selected

Program not empty

Media exists

Media available

Theme available

Schedule valid

Targets exist

No critical validation errors

Storage warnings

Offline targets

Cache warnings

Priority conflicts (future)

Validation results are divided into:

Errors

Warnings

Information

Errors block publishing.

Warnings require confirmation.

## 13. Revision Model

Live campaigns should never be edited directly.

Editing creates:

Revision

->

Validate

->

Publish

->

Replace Live Version

Previous revisions remain available.

## 14. Rollback

Every published campaign SHALL support rollback.

Rollback creates a new revision based on a previous version.

Rollback never mutates history.

## 15. Preview

Preview answers:

```text
"What will this campaign do
->
"
```

Supports:

Current time

Future time

Specific screen

Specific group

Simulation always uses the Scheduler Resolver.

## 16. Publish Impact

Before publication show:

Affected screens

Affected groups

Start time

End time

Expected priority

Validation summary

Warnings

This page reduces publishing mistakes.

## 17. History

History records:

Created

Edited

Validated

Published

Paused

Resumed

Expired

Archived

Rolled Back

Every event records:

User

Time

Reason

## 18. Audit Requirements

Campaign history SHALL never be lost.

Deleting a campaign should be discouraged.

Archive is preferred.

## 19. Future Extensions

Reserved:

Approval workflows

Multi-stage publishing

Automatic publishing windows

Templates

Campaign cloning

A/B testing

AI recommendations

## 20. Definition of Done

Campaign Lifecycle is complete when:

- Every state has one purpose.

- Every transition is defined.

- Publishing is validated.

- Rollback exists.

- Audit history exists.

- Scheduler Resolver remains runtime authority.

- Campaigns remain business objects.

## Relationship with Other Specifications

PRODUCT-001

Defines product philosophy.

PRODUCT-002

Defines workspace ownership.

PRODUCT-003

Defines UX principles.

PRODUCT-004

Defines Campaign workspace.

This document defines campaign behaviour.

---

## Document Navigation

- **Previous:** 04_WORKSPACES.md
- **Next:** 06_PUBLISHING_SPECIFICATION.md
- **Related specifications:** 04_WORKSPACES.md, 06_PUBLISHING_SPECIFICATION.md, 11_ACTIVITY_LOG_AND_AUDIT.md
