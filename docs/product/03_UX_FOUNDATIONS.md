# Narrowcasting UX Foundations

- **Document ID:** PRODUCT-003
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the user experience principles that govern every interface within the Narrowcasting platform.

It is the primary UX reference for:

Designers

Developers

Product Owners

AI-assisted development

Every newly designed page SHALL comply with this document before implementation begins.

## 2. UX Philosophy

Narrowcasting is professional operational software.

The interface must feel:

Predictable

Calm

Safe

Transparent

Fast

The user should always understand:

```text
Where am I
->

```

```text
What can I do
->

```

```text
What is the primary action
->

```

```text
What will happen if I continue
->

```

## 3. One Responsibility Principle

**REQ-UX-001**

Every page SHALL have exactly one primary responsibility.

Examples:

Media -> Manage media.

Campaigns -> Publish content.

Screens -> Manage deployment targets.

Diagnostics -> Explain system behaviour.

Pages SHALL NOT combine unrelated business concepts.

## 4. Progressive Disclosure

**REQ-UX-002**

Information shall be presented in layers.

Layer 1

Summary

->

Layer 2

Details

->

Layer 3

## Advanced

->

Layer 4

Diagnostics

->

Layer 5

Raw JSON

Users should never see implementation details unless they intentionally request them.

## 5. Visual Hierarchy

Every page SHALL follow the same structure.

```text
Page Title

->

Primary Action

->

Summary

->

Workspace

->

Details

->

Advanced
```

Users should immediately identify:

current object

current state

available action

## 6. Master / Detail

Default interaction model.

```text
+----------------------+-----------------------------+
| Object List          | Details                     |
|                      |                             |
|                      | Tabs                        |
|                      |                             |
+----------------------+-----------------------------+
```

The selected object always remains visible.

Context should never be lost.

## 7. Tabs

Tabs replace excessive scrolling.

## Examples

Screen

## Overview

## Playback

## Health

Groups

Campaigns

## History

## Advanced

Campaign

## Overview

Targets

Schedule

Preview

## History

Program

## Overview

Sequence

Preview

Usage

## 8. Buttons

Every workflow has one dominant action.

## Examples

Save Draft

Publish

Deploy

Approve

Other actions become secondary.

Dangerous actions always require confirmation.

## 9. Forms

Rules

Labels above controls.

Group related settings.

Validate immediately.

Explain errors clearly.

Disable invalid actions.

Preserve entered values whenever possible.

## 10. Tables

Tables SHALL support enterprise scale.

Required capabilities:

Search

Sort

Filter

Multi-select

Bulk actions

Future:

Saved views

Virtualization

Custom columns

## 11. Empty States

Never show an empty table without guidance.

Example

```text
No campaigns available.

Create your first campaign.
```

Every empty state shall answer:

```text
Why is nothing shown
->

```

```text
What should I do next
->

```

## 12. Loading

Skeletons are preferred over spinners.

The layout should remain stable while loading.

Avoid content jumps.

## 13. Error Handling

Every error shall answer three questions.

```text
What happened
->

```

```text
Why did it happen
->

```

```text
How can I recover
->

```

Never expose implementation details as primary messages.

## 14. Notifications

Two categories exist.

Transient

## Examples

Campaign saved.

Media uploaded.

Persistent

## Examples

Storage full.

Offline player.

Campaign validation failed.

Persistent notifications remain visible until resolved.

## 15. Status Colours

Green

Healthy

Blue

Selection

Orange

Warning

Red

Critical

Grey

Inactive

Colour alone SHALL never communicate status.

Icons and text remain mandatory.

## 16. Dialog Philosophy

Dialogs are reserved for:

Confirmation

Dangerous actions

Short workflows

Everything else belongs on dedicated pages.

## 17. Wizards

Wizards are used for:

First-time setup

Publishing

Imports

Recovery

Routine maintenance SHALL use normal editing screens.

## 18. Accessibility

Keyboard navigation is mandatory.

Visible focus states are mandatory.

Contrast ratios shall satisfy WCAG guidance where practical.

The platform shall remain usable without a mouse.

## 19. Performance Perception

The UI should always appear responsive.

Targets

Loading feedback within 100 ms.

Navigation within 250 ms.

Immediate acknowledgement of user actions.

Background processing should not block interaction.

## 20. Enterprise UX Requirements

**REQ-UX-020**

Lists exceeding 100 objects SHALL provide search before release.

**REQ-UX-021**

Lists exceeding 500 objects SHALL support filtering.

**REQ-UX-022**

Lists exceeding 1000 objects SHALL support virtualization.

**REQ-UX-023**

Bulk operations SHALL be available for deployment-related objects.

**REQ-UX-024**

Operational pages SHALL prioritise critical information above informational content.

## 21. Product-Specific Rules

The following concepts SHALL remain hidden during normal operation:

Assignments

Scheduler Candidates

Resolver Priority

Runtime Bindings

Raw JSON

They belong exclusively to Diagnostics and Advanced views.

## 22. Definition of UX Completion

A page is considered UX-complete only if:

- Purpose is immediately obvious.

- Primary action is unambiguous.

- Empty state exists.

- Loading state exists.

- Error state exists.

- Offline state exists.

- Keyboard navigation works.

- Advanced concepts remain hidden.

- The page complies with this document.

## 23. UX Golden Rule

Every implementation should satisfy this statement:

A first-time user should understand what this page does within five seconds, without reading documentation.

If that goal is not achieved, the design should be reconsidered before implementation.

---

## Document Navigation

- **Previous:** 02_INFORMATION_ARCHITECTURE.md
- **Next:** 04_WORKSPACES.md
- **Related specifications:** 02_INFORMATION_ARCHITECTURE.md, 04_WORKSPACES.md, 15_DESIGN_SYSTEM.md
