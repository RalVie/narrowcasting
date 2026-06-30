# Narrowcasting Installations & Locations Specification

- **Document ID:** PRODUCT-013
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how physical deployments are represented inside the Narrowcasting platform.

A professional Digital Signage platform must scale beyond individual screens.

Operators think in physical locations, not technical identifiers.

The platform should therefore model the real world.

## 2. Philosophy

A screen does not exist on its own.

It belongs somewhere.

Examples:

Company

->

Building

->

Floor

->

Department

->

Screen

or

Municipality

->

Town Hall

->

Reception

->

Screen

or

Retail Chain

->

Store

->

Fresh Produce

->

Screen

Users should navigate through real-world structures rather than screen IDs.

## 3. Installation Model

The highest logical object is an Installation.

An Installation represents one managed deployment.

## Examples

Corporate Headquarters

Shopping Mall

School

Hospital

Sports Arena

Airport

Factory

Each Installation has its own operational context.

## 4. Installation Structure

Installation

->

Locations

->

Screen Groups

->

Screens

->

Players

Players remain implementation details.

Screens are the operational endpoint.

## 5. Locations

Locations represent physical places.

## Examples

Reception

Lobby

Restaurant

Entrance

Meeting Room

Warehouse

Production Hall

Future versions may support unlimited hierarchy.

## 6. Location Hierarchy

Example

Installation

->

Building A

->

Floor 1

->

Reception

->

Screens

Hierarchy shall be unlimited.

## 7. Screen Ownership

Every screen belongs to

Exactly one Installation

Exactly one Location

Zero or more Screen Groups

This keeps physical ownership clear while allowing logical grouping.

## 8. Screen Groups

Groups represent logical collections.

## Examples

Reception Displays

Menu Boards

Outdoor Displays

Emergency Displays

Holiday Campaign

Groups are independent of physical location.

## 9. Locations vs Groups

Locations answer

```text
Where is the screen
->

```

Groups answer

```text
Which screens belong together operationally
->

```

These concepts must never be confused.

Example

Screen

->

Location

Reception

->

Groups

Holiday Campaign

Landscape Displays

Marketing

## 10. Navigation

Recommended navigation

Installation

->

Location

->

Screen

->

## Overview

Users should rarely search for screen IDs.

## 11. Deployment Overview

Every Installation provides

Screen Count

Online Status

Campaign Overview

Storage Health

Synchronization Health

Alerts

Activity

Operators manage installations, not isolated screens.

## 12. Location Dashboard

Every Location displays

Online Screens

Offline Screens

Current Campaigns

Alerts

Storage

Recent Activity

## Future

Environmental Sensors

## 13. Campaign Visibility

Campaigns should show

Affected Installations

Affected Locations

Affected Groups

Affected Screens

Users understand impact before publishing.

## 14. Bulk Operations

Installations enable

Bulk Publish

Bulk Move

Bulk Restart

Bulk Update

Bulk Diagnostics

Bulk Approval

Bulk Export

Bulk operations are essential for enterprise deployments.

## 15. Filtering

Every list should support

Installation

Location

Group

Status

## Health

Tags

Campaign

## Future

Geographical Region

## 16. Future Tags

Tags complement Locations.

## Examples

Landscape

Portrait

4K

Menu

Outdoor

Emergency

Tags never replace Locations.

## 17. Enterprise Scale

Support

1 Installation

->

10 Installations

->

100 Installations

->

Thousands of Screens

Navigation should remain unchanged.

## 18. Installation Lifecycle

Create

->

Configure

->

Deploy

->

Operate

->

Maintain

->

Archive

Historical installations remain searchable.

## 19. Requirements

**REQ-LOC-001**

Every screen SHALL belong to one Installation.

**REQ-LOC-002**

Every screen SHALL belong to one Location.

**REQ-LOC-003**

Locations SHALL support hierarchy.

**REQ-LOC-004**

Groups SHALL remain independent from Locations.

**REQ-LOC-005**

Campaigns SHALL report affected Installations.

**REQ-LOC-006**

Bulk operations SHALL operate on Installations, Locations and Groups.

**REQ-LOC-007**

Navigation SHALL prioritize physical structure over technical identifiers.

## 20. Future Extensions

Reserved

Maps

Floor Plans

GIS Integration

Building Management Systems

Digital Twins

Indoor Positioning

Maintenance Scheduling

Asset Management

## 21. Relationship with Other Specifications

PRODUCT-002

Defines Information Architecture.

PRODUCT-004

Defines Deployment Workspace.

PRODUCT-006

Defines Publishing.

PRODUCT-007

Defines Monitoring.

This document defines the physical organisation of the platform.

## 22. Definition of Done

The Installation Model is complete when

- Operators think in physical locations.

- Screen ownership is unambiguous.

- Groups remain logical.

- Navigation scales naturally.

- Enterprise deployments remain manageable.

- Future expansion requires no architectural redesign.

## Architect Notes

This document deliberately introduces Installations and Locations as first-class business concepts.

Many Digital Signage platforms eventually struggle because they begin with only Screens and Groups. As deployments grow, operators lose the connection between the software and the real world.

By modelling the physical environment explicitly, Narrowcasting gains a significant long-term advantage:

easier navigation

better monitoring

clearer publishing impact

scalable enterprise deployments

natural integration with future features such as maps, floor plans, asset management and IoT.

The mental model becomes:

Installation

->

Location

->

Screen

->

Campaign

->

## Playback

instead of

Screen ID

->

Group ID

->

Assignment

->

Player

That shift keeps the product understandable even when managing thousands of screens across many locations.

---

## Document Navigation

- **Previous:** 12_PREVIEW_AND_SIMULATION.md
- **Next:** 14_STORAGE_AND_MEDIA_MANAGEMENT.md
- **Related specifications:** 02_INFORMATION_ARCHITECTURE.md, 04_WORKSPACES.md, 06_PUBLISHING_SPECIFICATION.md
