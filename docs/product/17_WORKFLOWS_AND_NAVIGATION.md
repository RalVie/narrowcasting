# Narrowcasting Workflows & Navigation Specification

- **Document ID:** PRODUCT-017
- **Version:** 1.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how the Dashboard should be organised around human workflows rather than internal platform components.

It does not define new architecture.

It does not change runtime behaviour.

It does not redesign Publishing, Campaigns, Assignments, the Scheduler Resolver, or the Player.

Its purpose is to keep the Dashboard understandable as the platform grows.

The Dashboard should help users answer:

```text
What do I need to do today?
->
Where do I go next?
->
What requires attention?
->
What is advanced or diagnostic?
```

The product already contains many powerful capabilities. The navigation model must prevent those capabilities from competing for attention at the same level.

## 2. Navigation Philosophy

Users should think in outcomes, not implementation layers.

The primary mental model is:

```text
Create content
->
Publish content
->
Deploy to screens
->
Monitor operation
->
Investigate problems
->
Maintain the platform
```

The Dashboard navigation SHALL prioritise these workflows over the internal architecture.

The following concepts are important to the system but should not dominate normal navigation:

- Assignments
- Scheduler Candidates
- Resolver Priority
- Time Window evaluation
- Device protocol
- Raw schedule JSON
- Audit metadata
- Legacy scheduler blocks

These concepts belong behind progressive disclosure, diagnostics, or support workspaces.

### 2.1 Navigation Rules

**REQ-NAV-001**

Top-level navigation SHALL represent user workspaces, not technical entities.

**REQ-NAV-002**

Every top-level item SHALL answer a question a non-technical operator understands.

**REQ-NAV-003**

Advanced and diagnostic pages SHALL be discoverable, but not presented as daily destinations.

**REQ-NAV-004**

The Dashboard landing page SHALL be operational, not editorial. It should answer what needs attention first.

**REQ-NAV-005**

Runtime authority remains with the Scheduler Resolver. Navigation may expose diagnostics for resolver decisions, but it SHALL NOT imply that users directly edit resolver internals.

## 3. Primary User Personas

### 3.1 Content Editor

## Goals

- Upload media.
- Organise media into playlists.
- Build reusable programs.
- Maintain visual themes.

## Typical Daily Tasks

- Add images or videos.
- Replace outdated media.
- Build or adjust playlist order.
- Preview program composition.
- Maintain brand layout through themes.

## Pages Normally Used

- Media Library
- Playlists
- Programs
- Themes

## Pages Rarely Used

- Scheduler Diagnostics
- Advanced Assignments
- Audit
- System Status

## Navigation Expectation

The Content Editor should primarily live in the Content workspace. Publishing, deployment, and diagnostics should be visible only as context links when relevant.

### 3.2 Operator

## Goals

- Keep screens running.
- Understand what is currently live.
- React to offline screens, sync failures, cache issues, or playback problems.

## Typical Daily Tasks

- Check overall health.
- Inspect screen status.
- Confirm current playback.
- Investigate warnings.
- Escalate technical issues when needed.

## Pages Normally Used

- Dashboard
- System Status
- Screens
- Campaigns

## Pages Rarely Used

- Themes
- Advanced Assignments
- Legacy Scheduler
- Raw Diagnostics

## Navigation Expectation

The Operator should start from the operational Dashboard and move into Screens or Campaigns only when action is needed.

### 3.3 Campaign Manager

## Goals

- Publish content safely.
- Target screens and groups.
- Understand warnings and expected runtime impact.
- Keep campaign history auditable.

## Typical Daily Tasks

- Create campaign.
- Select program and targets.
- Configure campaign schedule and priority.
- Run publish validation.
- Confirm warnings if appropriate.
- Review publish impact.

## Pages Normally Used

- Campaigns
- Programs
- Screens
- Screen Groups
- Preview or Schedule Preview where available

## Pages Rarely Used

- Advanced Assignments
- Scheduler Diagnostics
- Audit, except for history review

## Navigation Expectation

The Campaign Manager should work primarily in Publishing. Runtime assignments and resolver traces should appear as explanation, not as the publishing interface.

### 3.4 Installer

## Goals

- Register players.
- Approve and name screens.
- Verify network and heartbeat status.
- Confirm player playback is healthy.

## Typical Daily Tasks

- Approve pending screen.
- Rename screen.
- Add screen to groups.
- Confirm device heartbeat.
- Diagnose setup issues.

## Pages Normally Used

- Screens
- Screen Groups
- System Status
- Scheduler Diagnostics when installation playback differs from expectation

## Pages Rarely Used

- Media Library
- Playlists
- Themes
- Campaign editing, unless performing acceptance testing

## Navigation Expectation

The Installer should work in Deployment and Monitoring. Content creation should be secondary.

### 3.5 Support Engineer

## Goals

- Explain why the platform behaved a certain way.
- Diagnose schedule resolution, sync, cache, device identity, and publishing issues.
- Support operators without exposing internal tools to everyone.

## Typical Daily Tasks

- Inspect Scheduler Diagnostics.
- Review Audit.
- Inspect system status.
- Compare expected campaign impact with resolved runtime state.
- Review advanced assignment state.

## Pages Normally Used

- Scheduler Diagnostics
- Audit
- System Status
- Schedule Preview
- Advanced Assignments

## Pages Rarely Used

- Media editing
- Theme design
- Routine campaign creation

## Navigation Expectation

Support tools should live together in a Support workspace. They should not be scattered among daily operator workflows.

### 3.6 Administrator

## Goals

- Maintain platform configuration.
- Manage security and access.
- Review auditability.
- Keep system settings stable.

## Typical Daily Tasks

- Manage admin session or credentials.
- Review settings.
- Inspect audit records.
- Plan future permissions and user management.

## Pages Normally Used

- Settings
- Audit
- System Status

## Pages Rarely Used

- Playlist editing
- Program sequencing
- Theme design

## Navigation Expectation

Administration should be a separate workspace. It should not contain normal content or publishing workflows.

## 4. Daily Workflows

### 4.1 Create Content

## Goal

Prepare reusable content building blocks.

## Flow

```text
Media Library
->
Playlists
->
Programs
->
Themes
```

## User Intent

The user is asking:

```text
What assets do I have?
->
How should they be ordered?
->
Which playlists form a complete program?
->
How should the content appear on screen?
```

## Relevant Pages

- Media Library
- Playlists
- Programs
- Themes

## Notes

This workflow should not require visiting Campaigns, Assignments, Scheduler Diagnostics, or Audit.

### 4.2 Publish Content

## Goal

Make a validated business decision about what screens should show.

## Flow

```text
Campaigns
->
Validation
->
Runtime Impact Preview
->
Warnings Confirmation
->
Publish
```

## User Intent

The user is asking:

```text
What should be shown?
->
Where should it be shown?
->
Is it safe to publish?
->
What will change?
```

## Relevant Pages

- Campaigns
- Programs, as a referenced business object
- Screens and Screen Groups, as target context
- Schedule Preview or Preview Simulator where available

## Notes

Publishing should never require direct editing of Assignments. Assignments are runtime bindings and should remain explainable but not central to normal publishing.

### 4.3 Deploy Content

## Goal

Ensure physical screens are known, approved, named, grouped, and ready to receive content.

## Flow

```text
Screens
->
Screen Details
->
Screen Groups
->
Campaign Targeting
```

## User Intent

The user is asking:

```text
Which screens exist?
->
Are they online?
->
Where do they belong?
->
Can they receive published content?
```

## Relevant Pages

- Screens
- Screen Groups
- System Status

## Notes

Deployment is not the same as publishing. Deployment owns physical targets. Publishing owns business intent.

### 4.4 Monitor Screens

## Goal

Know whether the platform is healthy and whether screens are playing expected content.

## Flow

```text
Dashboard
->
System Status
->
Screens
->
Screen Details
->
Diagnostics if needed
```

## User Intent

The user is asking:

```text
Is anything broken?
->
Which screen needs attention?
->
What is currently playing?
->
What should I do next?
```

## Relevant Pages

- Dashboard
- System Status
- Screens

## Notes

Monitoring should be mostly read-only. Editing should be entered intentionally from the appropriate workspace.

### 4.5 Troubleshoot Runtime

## Goal

Explain why a screen is showing, not showing, syncing, or failing to play specific content.

## Flow

```text
Screen
->
Current Playback
->
Scheduler Diagnostics
->
Schedule Preview
->
Audit
```

## User Intent

The user is asking:

```text
Why is this screen doing that?
->
Which assignment or campaign won?
->
Was media ready?
->
Who changed it?
```

## Relevant Pages

- Scheduler Diagnostics
- Schedule Preview
- Audit
- System Status
- Advanced Assignments, when source data must be inspected

## Notes

Troubleshooting is not a daily publishing workflow. It belongs in Support or Advanced Monitoring.

### 4.6 Maintain the Platform

## Goal

Keep the platform secure, configured, updated, and auditable.

## Flow

```text
Settings
->
Admin Session
->
Audit
->
System Status
```

## User Intent

The user is asking:

```text
Is the platform configured correctly?
->
Are privileged actions traceable?
->
Do settings need attention?
```

## Relevant Pages

- Settings
- Audit
- System Status

## Notes

Maintenance is administrative. It should not be mixed into content creation or campaign publishing.

## 5. Navigation Groups

The current Dashboard exposes many pages as top-level peers. This makes the interface reflect implementation maturity rather than daily use.

Product 1.0 implements this principle with these operator-facing groups:

```text
Home
Create
Publish
Operate
Support
```

Administration controls that are technical or session-oriented are discoverable from Support rather than exposed as daily operator destinations.

The recommended navigation groups are:

### 5.1 Home

## Purpose

Operational entry point.

## Contains

- Dashboard

## Why

Users need one place to start. The Dashboard should answer what needs attention and route users into the correct workspace.

### 5.2 Content

## Purpose

Create reusable publishable material.

## Contains

- Media Library
- Playlists
- Programs
- Themes

## Why

These pages represent the business content pipeline. They belong together because users move through them in sequence when preparing content.

### 5.3 Publishing

## Purpose

Control what should appear on screens.

## Contains

- Campaigns
- Schedule Preview or Preview Simulator as a secondary page

## Why

Campaigns express business intent. Publishing should not expose runtime assignments as the normal interface.

### 5.4 Deployment

## Purpose

Manage physical and logical playback targets.

## Contains

- Screens
- Screen Groups, preferably as a section or tab within Screens until scale requires a dedicated page

## Why

Screens and groups answer where content can appear. They are deployment concepts, not content or publishing concepts.

### 5.5 Monitoring

## Purpose

Observe health and respond to operational issues.

## Contains

- System Status
- Screen status views
- Future Alerts
- Future Incidents

## Why

Monitoring is read-oriented. It should not be mixed with editing workflows.

### 5.6 Support

## Purpose

Advanced diagnostics and explainability.

## Contains

- Scheduler Diagnostics
- Schedule Preview, if used primarily for troubleshooting
- Advanced Assignments
- Audit, when used for investigation
- Legacy Scheduler, if retained

## Why

These pages explain runtime behaviour. They are valuable, but they should not compete with daily content and publishing tasks.

### 5.7 Administration

## Purpose

Platform configuration and governance.

## Contains

- Settings
- Admin session controls
- Audit, when used for governance
- Future Users and Permissions
- Future Storage settings

## Why

Administrative actions are privileged and should remain separate from operator workflows.

## 6. Progressive Disclosure

Progressive disclosure protects users from accidental complexity.

The Dashboard SHALL expose advanced concepts in layers:

```text
Daily workflow
->
Object detail
->
Advanced section
->
Diagnostics
->
Raw data
```

### 6.1 Daily by Default

The following should be visible to most users:

- Dashboard
- Media Library
- Playlists
- Programs
- Themes
- Campaigns
- Screens
- System Status

### 6.2 Occasional or Contextual

The following should be reachable through context links, tabs, or secondary workspace navigation:

- Screen Groups
- Schedule Preview
- Audit
- Settings

### 6.3 Rare or Advanced

The following should not be normal top-level operator destinations:

- Advanced Assignments
- Scheduler Diagnostics
- Legacy Scheduler
- Raw JSON views
- Resolver candidate timelines

### 6.4 Principles

**REQ-NAV-006**

Normal operators SHALL NOT need to understand Assignments to publish content.

**REQ-NAV-007**

Diagnostics SHALL be read-only and intentionally entered.

**REQ-NAV-008**

Engineering tools SHALL not be mixed into Content or Publishing workspaces.

**REQ-NAV-009**

Legacy functionality SHALL be labelled as legacy, hidden from default workflows, or moved to Support.

## 7. Operational Dashboard

The landing page should optimise for attention and triage.

It should answer:

```text
Is the platform healthy?
->
Are screens online?
->
Is content publishing correctly?
->
Are there warnings requiring action?
->
What changed recently?
```

### 7.1 First Screen Priorities

The first screen should show:

- Overall health.
- Online/offline screen count.
- Critical warnings.
- Campaigns currently live or recently published.
- Synchronization health.
- Storage/cache warnings.
- Recent activity.

### 7.2 One-Click Destinations

The operator should reach the following in one click:

- Screens with warnings.
- Offline screens.
- Current campaigns.
- Failed synchronization.
- Pending screen approvals.

### 7.3 Multiple-Click Destinations

The following should require intentional navigation:

- Raw resolver trace.
- Assignment records.
- Audit metadata.
- Legacy scheduler blocks.
- Advanced settings.

### 7.4 Dashboard Rules

The Dashboard itself SHALL NOT become an editing workspace.

It routes users to the responsible workspace.

## 8. Support Workspace

The Support workspace exists because diagnostics are important but not daily work for most users.

Support should answer:

```text
Why did this happen?
->
What data did the system use?
->
Which decision won?
->
Who changed something?
->
What should be escalated?
```

### 8.1 Recommended Support Tools

- Scheduler Diagnostics
- Schedule Preview
- Advanced Assignments
- Audit
- System Status diagnostics
- Future Player logs
- Future Sync diagnostics
- Future Cache validation

### 8.2 Support Workspace Rules

**REQ-SUPPORT-001**

Support pages SHALL be read-first.

**REQ-SUPPORT-002**

Dangerous actions SHALL not be placed in Support unless clearly administrative and confirmed.

**REQ-SUPPORT-003**

Support pages SHALL explain user-facing consequences before technical details.

**REQ-SUPPORT-004**

Raw JSON SHALL be collapsed by default.

## 9. Future Growth

Future modules must be added without flattening navigation.

New features should be placed according to user intent:

| Future module | Recommended home | Reason |
| --- | --- | --- |
| Locations | Deployment | Locations describe where screens physically exist. |
| Installations | Deployment or Administration | Installation is physical deployment plus platform setup. |
| Templates | Content | Templates help create reusable content and themes. |
| Edge Servers | Administration with Monitoring views | Edge servers are platform infrastructure. |
| Cloud | Administration | Cloud is platform configuration and account-level capability. |
| Remote Management | Monitoring and Administration | Remote actions begin from operational state but are governed administratively. |
| Users and Roles | Administration | Access control is platform governance. |
| Alerts | Monitoring | Alerts represent operational attention. |
| Incident Management | Monitoring | Incidents are operational workflows. |
| Preview Simulator | Publishing and Support | Preview is used before publish and during troubleshooting. |

### 9.1 Growth Rules

**REQ-NAV-010**

New modules SHALL be attached to an existing workspace unless they introduce a genuinely new user responsibility.

**REQ-NAV-011**

The number of top-level navigation groups should remain small.

**REQ-NAV-012**

Large enterprise scale should be handled by search, filters, saved views, tabs, and object detail pages, not by adding more top-level pages.

## 10. Current Dashboard Page Review

This section classifies every existing Dashboard page after Phases 1-15.

It is not an implementation instruction. It defines product intent for future navigation cleanup.

| Current page | Primary workspace | Typical persona | Usage frequency | Top-level recommendation | Rationale |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Home / Monitoring | Operator | Daily | Home | Primary operational entry point with health, publishing, synchronization, media, and recent activity. |
| Media Library | Content | Content Editor | Daily | Remain top-level within Content | First step in content creation. |
| Playlists | Content | Content Editor | Daily | Remain top-level within Content | Core content organisation workflow. |
| Programs | Content | Content Editor / Campaign Manager | Daily / Occasional | Remain top-level within Content | Program composition is a major reusable building block. |
| Themes | Content | Content Editor / Brand Manager | Occasional | Remain top-level within Content or secondary Content item | Important, but not necessarily daily for every operator. |
| Campaigns | Publishing | Campaign Manager | Daily / Occasional | Publish | Primary campaign workspace with scheduling, priority, validation, and publishing actions. |
| Screens | Deployment / Monitoring | Installer / Operator | Daily / Occasional | Operate | Screens are the main deployment object and now show health, sync, campaign target, groups, and actions as cards. |
| Screen Groups | Deployment | Installer / Administrator | Occasional | Secondary item under Operate | Groups are managed through the Screens deployment workspace. |
| Monitoring | Monitoring | Operator / Support Engineer | Daily / Occasional | Operate | Health view shows screens, publishing, synchronization, storage, and recent activity. |
| Schedule Preview | Publishing / Support | Campaign Manager / Support Engineer | Occasional | Move to secondary Publishing or Support | It supports publish confidence and troubleshooting, but is not the main publishing object. |
| Scheduler | Support / Legacy | Support Engineer | Rare | Move to Support, label legacy/deprecated if runtime-inactive | Legacy scheduler concepts should not appear as normal operations. |
| Scheduler Diagnostics | Support | Support Engineer / Operator | Rare / Occasional | Move to Support secondary navigation | Critical for explainability, but advanced and read-only. |
| Advanced Assignments | Support / Administration | Support Engineer / Administrator | Rare | Move to Support or Administration advanced area | Assignments are runtime bindings and should not be normal publishing UI. |
| Audit | Support / Administration | Administrator / Support Engineer | Occasional / Rare | Support | Audit is governance and investigation, with search and simple client-side filters. |
| Settings | Support / Administration | Administrator | Occasional | Support | Platform configuration areas belong outside daily workflows. |
| Admin Session | Support / Administration | Administrator / Support Engineer | Occasional | Support | Local admin key state is technical and should be obvious when needed but hidden from daily operators. |

## 11. Recommended Navigation Outcome

The long-term Dashboard should feel like this:

```text
Home
  Dashboard

Create
  Media Library
  Playlists
  Programs
  Themes

Publish
  Campaigns
  Preview / Schedule Preview

Operate
  Screens
  Screen Groups
  Monitoring
  Future Alerts
  Future Incidents

Support
  Support Overview
  Scheduler Diagnostics
  Schedule Preview
  Audit
  Settings
  Admin Session
  Advanced Assignments
  Legacy Scheduler
  Future Users & Roles
```

This organisation preserves all functionality while reducing cognitive load.

## 12. Definition of Done

Navigation is considered aligned with this specification when:

- Daily users start from workflows rather than technical pages.
- Top-level navigation contains only major workspaces.
- Runtime concepts are hidden behind Support or Advanced.
- The Dashboard answers operational attention first.
- Publishing remains campaign-centred.
- Deployment remains screen-centred.
- Monitoring remains read-oriented.
- Administration remains separate from daily operation.
- Future modules can be added without creating a long flat menu.

## Final Statement

Narrowcasting is now functionally rich enough that navigation must become selective.

The product should not show every capability at the same level simply because it exists.

The Dashboard should guide users from intent to outcome, while keeping advanced diagnostic power available for the people who need it.

---

## Document Navigation

- **Previous:** 16_IMPLEMENTATION_GUIDELINES.md
- **Next:** None
- **Related specifications:** 03_UX_FOUNDATIONS.md, 04_WORKSPACES.md, 05_CAMPAIGN_LIFECYCLE.md, 07_MONITORING_AND_OPERATIONS.md, 08_ROLES_AND_PERMISSIONS.md
