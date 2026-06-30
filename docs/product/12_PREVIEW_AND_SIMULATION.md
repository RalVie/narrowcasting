# Narrowcasting Preview & Simulation Specification

- **Document ID:** PRODUCT-012
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how the Narrowcasting platform previews future playback before publication.

Preview is one of the defining features of the platform.

Users should never need to guess what a player will display.

The platform should always be able to answer:

```text
What will this screen display
->

```

and

```text
Why will it display that content
->

```

## 2. Design Philosophy

Preview is not a mock-up.

Preview is not a fake simulation.

Preview executes the same business rules used by production.

Whenever possible, Preview SHALL use the Scheduler Resolver itself.

This guarantees:

consistency

trust

explainability

## 3. Preview Types

The platform defines four preview modes.

Content Preview

Shows a single media asset.

Purpose:

Visual inspection.

Program Preview

Shows playback sequence.

Purpose:

Verify timing.

Transitions.

Theme.

Campaign Preview

Shows how a campaign behaves.

Purpose:

Validate publishing.

Runtime Simulation

Uses the Scheduler Resolver.

Purpose:

Predict real playback.

## 4. Runtime Simulation

Simulation answers:

```text
What plays now
->

```

```text
What plays tomorrow
->

```

```text
What plays Friday at 14:30
->

```

```text
What plays on Christmas morning
->

```

```text
What plays on Screen 17
->

```

Simulation uses:

Screen

->

Date

->

Time

->

Scheduler Resolver

->

Resolved Schedule

->

Preview

No duplicate scheduling logic is permitted.

## 5. Simulation Inputs

Required:

Screen

Date

Time

Optional:

Location (future)

Player Version

Emergency Mode

Trigger State (future)

Weather (future)

Audience (future)

Simulation must remain deterministic.

## 6. Simulation Output

The result contains:

Winning Campaign

Program

Playlist

Theme

Current Media

Upcoming Media

Schedule Timeline

Winning Priority

Reason

Resolver Trace

## 7. Explainability

Every simulation SHALL answer:

```text
Why did this campaign win
->

```

```text
Why did another campaign lose
->

```

```text
Which candidates were evaluated
->

```

```text
Which rules were applied
->

```

Simulation SHALL expose the Explainable Scheduler Resolver.

## 8. Timeline View

The operator may inspect future playback.

Example

08:00 Breakfast

->

09:30 Campaign A

->

11:00 Campaign B

->

13:00 Lunch

->

17:00 Closing

Timeline should be interactive.

## 9. Screen Preview

Every screen provides:

Current playback

Future playback

Campaign timeline

Synchronization state

Diagnostics shortcut

## 10. Publish Preview

Before publication:

Preview exactly what affected screens will display.

The operator may inspect:

Now

Tomorrow

Custom Date

Custom Time

Future Schedule

## 11. Conflict Preview

Future releases should highlight:

Priority conflicts

Campaign overlap

Missing media

Offline targets

Storage risks

Cache risks

Potential schedule collisions

## 12. Simulation Accuracy

Preview SHALL always use:

Published data

Resolved schedules

Current resolver logic

Simulation SHALL NEVER implement its own scheduling engine.

## 13. Performance

Preview should respond within one second.

Long-running simulations should stream progress.

The operator should never wait without feedback.

## 14. Future Extensions

Future simulation inputs:

Weather

Temperature

MQTT

Emergency State

External APIs

Sensor Inputs

Time Zones

Holiday Calendars

Because the Scheduler Resolver remains the authority, these features automatically become previewable.

## 15. Requirements

**REQ-PREV-001**

Every campaign SHALL support preview.

**REQ-PREV-002**

Preview SHALL use Scheduler Resolver logic.

**REQ-PREV-003**

Simulation SHALL explain the winning candidate.

**REQ-PREV-004**

Simulation SHALL expose future playback.

**REQ-PREV-005**

Simulation SHALL never duplicate runtime behaviour.

**REQ-PREV-006**

Publish Preview SHALL use the same simulation engine.

**REQ-PREV-007**

Future triggers SHALL automatically become previewable.

## 16. Enterprise Scale

Simulation shall support:

Single screen

->

Groups

->

Locations

->

Entire installations

Future:

Multi-installation comparison

Regional simulation

Global simulation

## 17. Relationship with Other Specifications

PRODUCT-005

Campaign Lifecycle

PRODUCT-006

Publishing

PRODUCT-007

Monitoring

PRODUCT-010

Alerts

PRODUCT-011

Activity & Audit

Preview bridges business workflows and runtime behaviour.

## 18. Definition of Done

Preview & Simulation is complete when:

- Operators can preview every publication.

- Runtime behaviour is predictable.

- Scheduler Resolver remains authoritative.

- Every decision is explainable.

- Future scheduling features become previewable automatically.

- Users trust what they see before publishing.

## Architect Notes

Preview is intentionally treated as a core product capability, not as a convenience feature.

One of the strongest differentiators of Narrowcasting should become:

The platform never asks users to trust it blindly.

Every publication can be simulated.

Every runtime decision can be explained.

Every playback decision can be inspected before it reaches a player.

This philosophy should remain true regardless of future features such as holiday calendars, AI scheduling, weather integration or external triggers, because they all execute through the same Scheduler Resolver and therefore automatically become explainable and previewable.

---

## Document Navigation

- **Previous:** 11_ACTIVITY_LOG_AND_AUDIT.md
- **Next:** 13_INSTALLATIONS_AND_LOCATIONS.md
- **Related specifications:** 05_CAMPAIGN_LIFECYCLE.md, 06_PUBLISHING_SPECIFICATION.md, 07_MONITORING_AND_OPERATIONS.md
