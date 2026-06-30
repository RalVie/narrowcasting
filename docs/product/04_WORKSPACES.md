# Narrowcasting Workspace Specification

- **Document ID:** PRODUCT-004
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document specifies every primary workspace within the Narrowcasting platform.

A workspace is an isolated environment with one responsibility.

A workspace owns:

navigation

workflows

objects

actions

A workspace never owns another workspace's responsibility.

## 2. Dashboard Workspace

## Purpose

Operational overview.

The Dashboard answers one question:

```text
What needs my attention right now
->

```

The Dashboard is never used for editing.

Primary Widgets

Platform Health

Player Status

Alerts

Current Campaigns

Storage

Recent Activity

Pending Actions

Upcoming Publications

## Primary Action

Investigate

The Dashboard links to workspaces.

It never becomes a workspace itself.

## 3. Content Workspace

Content answers:

```text
What can I publish
->

```

Contains:

Media

Playlists

Programs

Themes

Media

## Purpose

Manage media assets.

## Layout

```text
Folders

->

Media Grid

->

Preview

->

Metadata
```

## Primary Action

Upload

## Future

AI tagging

Usage

Duplicate detection

Playlists

## Purpose

Organise media.

## Layout

```text
Playlists

->

Items

->

Properties
```

## Primary Action

Create Playlist

Programs

## Purpose

Compose playback.

## Layout

```text
Programs

->

Program Sequence

->

Properties
```

## Tabs

## Overview

Sequence

Preview

Usage

## Primary Action

Save Program

Themes

## Purpose

Visual presentation.

## Layout

```text
Layers

->

Canvas

->

Properties
```

## Primary Action

Save Theme

## 4. Deployment Workspace

Deployment answers:

```text
Where should content be shown
->

```

## Contains

Screens

Screen Groups

## Future

Locations

Buildings

Departments

Screens

## Layout

```text
Screen List

->

Selected Screen

->

Tabs
```

## Tabs

## Overview

## Playback

## Health

## Cache

Groups

Campaign Visibility

## History

## Advanced

## Overview

Shows

Name

Status

Screenshot

Current Campaign

Current Program

Current Playlist

Last Seen

Software Version

## Playback

Shows

Current media

Upcoming media

Schedule

Playback state

## Health

Shows

CPU

Memory

Disk

Temperature

Connectivity

## Cache

Shows

Media cache

Pending downloads

Cache cleanup

Cache size

## History

Registration

Approval

Campaign changes

Connectivity

Updates

## Advanced

Assignments

Resolver links

Developer diagnostics

Runtime information

Screen Groups

## Purpose

Organise deployment.

## Layout

```text
Groups

->

Members

->

Properties
```

## Tabs

## Overview

Members

Campaign Visibility

## History

## Primary Action

Create Group

## 5. Publishing Workspace

Publishing answers:

```text
What should be shown
->

```

## Contains

Campaigns

Calendar

Preview Simulator

Campaigns

Campaigns are the primary publishing object.

All publishing starts here.

Campaign Layout

```text
Campaign List

->

Campaign Details

->

Tabs
```

## Tabs

## Overview

Targets

Schedule

Preview

Validation

## History

Campaign Overview

## Contains

Name

Status

Priority

Program

Theme

Lifecycle

Owner

Last Published

Targets

Assign

Screens

Groups

Locations (future)

Schedule

Visual schedule editor.

No runtime concepts.

Preview

```text
"What will users see
->
"
```

Supports

Now

Custom date/time

Specific screen

Validation

Checks

Missing media

Invalid schedule

Offline screens

Empty program

Theme availability

Publish blockers

Warnings

## History

Publish history

Changes

Rollback

Audit

Campaign Lifecycle

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

Each transition is validated.

Calendar

## Purpose

Planning.

Calendar visualises campaign activity.

Calendar does not own runtime scheduling.

Calendar edits Campaign timing only.

Preview Simulator

## Purpose

Answer

```text
"What will this screen show
->
"
```

Inputs

Screen

Date

Time

Outputs

Winning campaign

Explanation

Timeline

## 6. Monitoring Workspace

Monitoring answers

```text
Is everything healthy
->

```

## Contains

Live Status

Alerts

Diagnostics

Activity Log

Live Status

Real-time platform state.

Alerts

Prioritised by severity.

Critical

Warning

Information

Resolved

Diagnostics

Read-only.

Explains runtime decisions.

Never edits runtime.

Activity Log

Who

Did what

When

Why

## 7. Administration Workspace

## Purpose

Platform configuration.

## Contains

Settings

Users

Permissions

Storage

Updates

## Advanced

Administration never contains business workflows.

## 8. Workspace Rules

**REQ-WS-001**

Every workspace owns one business responsibility.

**REQ-WS-002**

Every workspace has one primary workflow.

**REQ-WS-003**

Every business object has one owner.

**REQ-WS-004**

Runtime concepts remain inside Diagnostics or Advanced.

**REQ-WS-005**

No workspace duplicates another workspace.

**REQ-WS-006**

Every workspace defines

Loading

Empty

Offline

Error

Permission

States.

## 9. Definition of Workspace Completion

A workspace is complete when

- Navigation is clear.

- Primary workflow is obvious.

- Advanced concepts remain hidden.

- Scaling requirements are met.

- Responsibilities are not duplicated.

- It follows PRODUCT-001, PRODUCT-002 and PRODUCT-003.

---

## Document Navigation

- **Previous:** 03_UX_FOUNDATIONS.md
- **Next:** 05_CAMPAIGN_LIFECYCLE.md
- **Related specifications:** 02_INFORMATION_ARCHITECTURE.md, 03_UX_FOUNDATIONS.md, 05_CAMPAIGN_LIFECYCLE.md
