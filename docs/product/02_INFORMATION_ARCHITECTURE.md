# Narrowcasting Information Architecture

- **Document ID:** PRODUCT-002
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the logical structure of the Narrowcasting product.

It specifies:

navigation

workspaces

ownership of business concepts

ownership of runtime concepts

relationships between pages

navigation philosophy

This document does NOT describe implementation.

It describes how users experience the platform.

## 2. Design Philosophy

Users think in goals.

Not objects.

Not implementation.

Therefore navigation must answer questions instead of exposing technical models.

Examples:

- I want to publish content.

- I want to check a screen.

- I want to see today's campaigns.

Not:

- I want to edit assignments.

- I want to inspect runtime candidates.

## 3. Workspace Model

The application consists of five workspaces.

```text
Dashboard

CONTENT

Deployment

Publishing

Monitoring

Administration
```

Every workspace owns a specific responsibility.

No responsibility may exist in multiple workspaces.

## 4. Dashboard

Primary Question

```text
What requires my attention right now
->

```

Dashboard is NOT:

configuration

editing

publishing

Dashboard IS:

overview

alerts

activity

health

Dashboard should always show the most important information first.

## 5. Content Workspace

Primary Question

```text
What content do I have available
->

```

## Contains

Media

Playlists

Programs

Themes

Content never knows:

screens

scheduling

runtime

It only prepares reusable business assets.

## 6. Deployment Workspace

Primary Question

```text
Where will content appear
->

```

## Contains

Screens

Screen Groups

## Future

Locations

Buildings

Departments

Tags

Deployment never edits content.

Deployment only describes destinations.

## 7. Publishing Workspace

Primary Question

```text
What should be shown, where and when
->

```

## Contains

Campaigns

Calendar

Preview Simulator (future)

Publishing owns business intent.

Publishing does NOT own runtime decisions.

## 8. Monitoring Workspace

Primary Question

```text
What is happening
->

```

## Contains

Live Status

Alerts

Diagnostics

Activity Log

Monitoring never edits business objects.

It explains system behaviour.

## 9. Administration Workspace

Primary Question

```text
How is the platform configured
->

```

## Contains

Settings

Users

Permissions

Storage

Updates

## Advanced

Administration never becomes a dumping ground for unrelated pages.

## 10. Business Objects

Business Objects represent user intent.

```text
Media

->

Playlist

->

Program

->

Campaign
```

These objects are visible.

Editable.

Searchable.

Versioned.

## 11. Runtime Objects

Runtime Objects implement business intent.

```text
Assignment

->

Candidate

->

Priority

->

Resolver

->

Resolved Schedule

->

Player
```

Runtime Objects are not part of normal workflows.

They appear only in:

Diagnostics

## Advanced

Developer tools

## 12. Navigation Rules

**REQ-IA-001**

Every menu item SHALL represent a user goal.

**REQ-IA-002**

Every business object SHALL have exactly one owning workspace.

**REQ-IA-003**

Runtime concepts SHALL NOT appear in primary navigation.

**REQ-IA-004**

Users SHALL never navigate through implementation layers.

**REQ-IA-005**

Diagnostics SHALL explain behaviour.

Diagnostics SHALL NOT replace operational workflows.

## 13. Page Relationships

Normal operator flow:

```text
Dashboard

->

Campaign

->

Publish

->

Monitor

->

Diagnostics (if necessary)
```

Developer flow:

```text
Diagnostics

->

Resolver Trace

->

Candidate Timeline

->

Raw JSON
```

The developer workflow must never become the operator workflow.

## 14. Scale Requirements

The Information Architecture SHALL support:

1 screen

->

10 screens

->

100 screens

->

1000 screens

->

Multiple installations

without changing the navigation model.

Large installations require:

search

filters

saved views

locations

tags

bulk operations

These are architectural requirements.

Not optional enhancements.

## 15. Ownership Rules

Campaigns own:

Business publishing.

Calendar owns:

Visual planning.

Scheduler Resolver owns:

Runtime decisions.

Player owns:

Playback.

Diagnostics owns:

Explanation.

This separation SHALL never be violated.

## 16. Forbidden Patterns

The following are prohibited:

- Editing Campaigns from Screens.

- Editing Campaigns from Screen Groups.

- Editing Assignments during normal operation.

- Multiple pages owning the same business concept.

- Technical runtime concepts replacing business workflows.

## 17. Future Expansion

Future workspaces may include:

Installations

Locations

Users

Audit

Reports

Analytics

Templates

API

The navigation philosophy must remain unchanged.

Future functionality expands workspaces.

It does not replace them.

## 18. Definition of Done

The Information Architecture is considered complete when:

every concept has one owner

every page has one responsibility

every workflow feels natural

runtime concepts stay hidden

navigation scales without redesign

---

## Document Navigation

- **Previous:** 01_PRODUCT_VISION.md
- **Next:** 03_UX_FOUNDATIONS.md
- **Related specifications:** 01_PRODUCT_VISION.md, 03_UX_FOUNDATIONS.md
