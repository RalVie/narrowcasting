# Narrowcasting Design System

- **Document ID:** PRODUCT-015
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines the visual language of the Narrowcasting platform.

The purpose of the Design System is consistency.

Every page should feel like it belongs to the same application.

The Design System is mandatory.

Individual pages may not invent their own styles.

## 2. Design Goals

The UI should feel:

Professional

Calm

Predictable

Modern

Spacious

Fast

Avoid:

Visual noise

Excessive borders

Large gradients

Decorative effects

Animation for decoration

The platform is an operational tool.

Function comes before decoration.

## 3. Layout System

Application Layout

```text
+------------------------------------------------------------+
| Sidebar                                                    |
+----------------------+-------------------------------------+
|                      | Header                              |
|                      +-------------------------------------+
|                      | Toolbar                             |
|                      +-------------------------------------+
|                      | Workspace                           |
|                      |                                     |
|                      +-------------------------------------+
|                      | Status Bar                          |
+----------------------+-------------------------------------+
```

Every page follows this structure.

## 4. Spacing

Use an 8-point spacing system.

Allowed spacing:

4

8

12

16

24

32

48

64

Random spacing values are discouraged.

## 5. Typography

Hierarchy

H1

Workspace Title

H2

Section Title

H3

Panel Title

Body

Default Text

Caption

Metadata

Monospace

IDs

JSON

Diagnostics

## 6. Color Philosophy

Color communicates state.

Never decoration.

Primary Accent

Blue

Success

Green

Warning

Orange

Danger

Red

Information

Cyan

Disabled

Grey

Dark Theme remains default.

## 7. Status Indicators

Every status includes:

Color

Icon

Text

Example

🟢 Online

🟠 Synchronizing

🔴 Offline

Never rely on color alone.

## 8. Cards

Cards group information.

Rules

Consistent padding

Consistent border radius

Consistent elevation

Cards never scroll independently unless absolutely necessary.

## 9. Panels

Panels divide workspaces.

Example

```text
List

->

Details

->

Advanced
```

Panels should be resizable in future versions.

## 10. Tables

Tables are enterprise-first.

Every table should eventually support

Search

Sorting

Filtering

Multi Select

Bulk Actions

Saved Views

Resizable Columns

Virtualization

Large datasets remain responsive.

## 11. Forms

Forms follow one structure.

Label

->

Control

->

Help Text

->

Validation

Group related fields.

Never create excessively long forms.

## 12. Buttons

Primary

One dominant action.

Secondary

Supporting actions.

Danger

Delete

Archive

Reset

Danger actions require confirmation.

## 13. Icons

Icons support labels.

Icons never replace labels.

Every icon must have consistent meaning.

## 14. Navigation

Navigation remains persistent.

Users should always know

Where they are.

Where they came from.

Where they can go.

Breadcrumbs may be introduced later.

## 15. Empty States

Every workspace defines

Title

Explanation

## Primary Action

Example

```text
No Campaigns

Create your first Campaign.
```

Empty states encourage action.

## 16. Loading States

Preferred

Skeleton UI

Avoid

Layout jumps

Blocking overlays

Unexplained waiting

## 17. Error States

Every error contains

Problem

Reason

Recovery

Support ID (future)

Never expose stack traces.

## 18. Notifications

Transient

Information

Persistent

Warnings

Critical

Require acknowledgement.

Notification Center is planned.

## 19. Dialogs

Dialogs are used only for

Confirmation

Dangerous actions

Small workflows

Complex editing belongs on dedicated pages.

## 20. Wizards

Used for

Installation

Publishing

Recovery

Imports

Daily work should remain Master/Detail.

## 21. Workspace Consistency

Every workspace should contain

Page Header

## Primary Action

Summary

Workspace

Details

## Advanced

Footer (optional)

The structure never changes.

## 22. Responsive Behaviour

Primary target

Desktop

Minimum

1366 × 768

Recommended

1920 × 1080

Optimized

4K

Tablet

Monitoring only.

Mobile

Read-only.

## 23. Accessibility

Keyboard navigation

Visible focus

Readable contrast

Consistent tab order

Screen reader friendly labels

Future WCAG compliance.

## 24. Animation

Animation communicates change.

## Examples

Loading

Expansion

Navigation

Avoid decorative animation.

Duration

100-250 ms.

## 25. Future Design Tokens

Spacing

Typography

Colors

Radius

Elevation

Animation

Icons

All visual values should eventually become centralized design tokens.

## 26. Requirements

**REQ-DS-001**

All pages SHALL use the Design System.

**REQ-DS-002**

Color SHALL communicate state.

**REQ-DS-003**

Cards SHALL remain visually consistent.

**REQ-DS-004**

Tables SHALL scale to enterprise datasets.

**REQ-DS-005**

Dialogs SHALL remain focused.

**REQ-DS-006**

Desktop is the primary platform.

**REQ-DS-007**

Animations SHALL improve understanding.

**REQ-DS-008**

Future themes SHALL inherit the same design tokens.

## 27. Definition of Done

The Design System is complete when

- Every page looks related.

- Components behave consistently.

- Navigation is predictable.

- Enterprise scale is supported.

- Accessibility is respected.

- Future themes require minimal implementation effort.

## Relationship with Other Specifications

PRODUCT-003

UX Foundations

PRODUCT-004

Workspace Specification

This document defines the visual implementation rules for every future interface.

## Architect Notes

The Design System is intentionally separated from the UX Foundations.

UX Foundations define behaviour.

The Design System defines appearance.

Keeping these documents separate ensures that future redesigns (for example, introducing a light theme or a refreshed visual style) can happen without changing the underlying interaction model.

This separation also enables future adoption of design tokens and component libraries while preserving a consistent user experience.

---

## Document Navigation

- **Previous:** 14_STORAGE_AND_MEDIA_MANAGEMENT.md
- **Next:** 16_IMPLEMENTATION_GUIDELINES.md
- **Related specifications:** 03_UX_FOUNDATIONS.md, 04_WORKSPACES.md
