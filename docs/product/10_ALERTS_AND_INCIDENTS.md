# Narrowcasting Alerts & Incident Management Specification

- **Document ID:** PRODUCT-010
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how operational issues are detected, presented, managed and resolved.

Monitoring tells operators what is happening.

Alerting tells operators what requires action.

Incident Management helps operators restore normal operation.

## 2. Philosophy

An operator should never need to continuously watch the dashboard.

Instead:

The platform identifies abnormal situations.

Prioritises them.

Explains them.

Tracks their resolution.

## 3. Definitions

Notification

Short-lived message.

## Examples

Campaign published.

Media uploaded.

Player registered.

Notifications disappear automatically.

Alert

Operational issue requiring attention.

## Examples

Offline Player.

Storage Full.

Synchronization Failed.

Alerts remain visible until resolved.

Incident

One or more related alerts that require investigation.

## Examples

Entire location offline.

Storage server unavailable.

Mass synchronization failure.

## 4. Alert Lifecycle

```text
Detected

->

Open

->

Acknowledged

->

Investigating

->

Resolved

->

Closed

->

Archived
```

Every transition is recorded.

## 5. Alert Severity

Critical

Platform functionality affected.

Examples:

Player Offline

Storage Full

Resolver Failure

Database Failure

Warning

Attention required soon.

Examples:

Storage >90%

Campaign expires today

Synchronization delayed

Cache almost full

Information

Operational event.

Examples:

Campaign published

Player approved

Media imported

Resolved

Problem no longer exists.

Retained for history.

## 6. Alert Categories

Platform

Player

Screen

Campaign

Publishing

Synchronization

Storage

Security

Network

Future:

AI

Integrations

Cloud

## 7. Alert Object

Every alert contains

Alert ID

Category

Severity

Status

Created

Updated

Owner

Description

Recommended Action

Affected Objects

Related Events

Related Diagnostics

## 8. Alert Ownership

Alerts may be assigned.

Assignment contains

Assigned User

Assigned Team (future)

Priority

Due Date (future)

Notes

Ownership improves accountability.

## 9. Alert Dashboard

Operators should immediately see

Critical

->

Warnings

->

Information

Critical alerts always appear first.

No scrolling required.

## 10. Alert Actions

Possible actions

Open

Acknowledge

Assign

Resolve

Reopen

Archive

Every action is logged.

## 11. Incident Management

An incident groups related alerts.

Example

```text
Storage Server Offline

->

Player Sync Failed

->

Campaign Download Failed

->

Offline Cache Warning
```

The operator investigates one incident rather than dozens of unrelated alerts.

## 12. Incident Lifecycle

```text
Open

->

Investigating

->

Mitigated

->

Resolved

->

Closed
```

Incidents maintain history.

## 13. Diagnostics Integration

Every alert links directly to

Diagnostics

Player

Campaign

Synchronization

Activity Log

Operators should never manually search.

## 14. Activity Integration

Every alert creates Activity Log entries.

Every incident creates Activity Log entries.

History is chronological.

## 15. Escalation

## Future

Escalation Rules

Example

Critical unresolved for 15 minutes

->

Notify Administrator

->

Notify SMS

->

Notify Teams

## 16. Requirements

**REQ-ALT-001**

Every operational problem SHALL create an alert.

**REQ-ALT-002**

Every alert SHALL have a severity.

**REQ-ALT-003**

Every alert SHALL belong to a category.

**REQ-ALT-004**

Every alert SHALL have a lifecycle.

**REQ-ALT-005**

Every alert SHALL be traceable.

**REQ-ALT-006**

Alerts SHALL integrate with Diagnostics.

**REQ-ALT-007**

Alerts SHALL integrate with Activity Log.

**REQ-ALT-008**

Incident grouping SHALL be supported.

## 17. Enterprise Scale

Alert management shall support

1 player

->

100 players

->

1000 players

->

Multiple installations

Capabilities

Search

Filters

Severity

Locations

Owners

Saved Views

Bulk Acknowledge

Bulk Resolve

## 18. Future Extensions

Reserved

Email notifications

Microsoft Teams

Slack

SMS

Webhook integrations

Automatic remediation

Predictive alerts

AI incident grouping

Maintenance windows

## 19. Definition of Done

Alerts & Incident Management is complete when

- Every problem becomes an alert.

- Every alert has context.

- Alerts link directly to diagnostics.

- Incidents group related alerts.

- Operators always know what to do next.

- Alert history is preserved.

- Enterprise scale is supported.

## Relationship with Other Specifications

PRODUCT-007

Defines Monitoring.

PRODUCT-009

Defines Offline & Synchronization.

This document defines how operational issues become actionable work for operators.

---

## Document Navigation

- **Previous:** 09_OFFLINE_AND_SYNCHRONIZATION.md
- **Next:** 11_ACTIVITY_LOG_AND_AUDIT.md
- **Related specifications:** 07_MONITORING_AND_OPERATIONS.md, 11_ACTIVITY_LOG_AND_AUDIT.md
