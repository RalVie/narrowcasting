# Narrowcasting Product Specification

- **Documentation set:** Product Specification
- **Status:** Official Product Vision Layer
- **Source of truth:** Markdown in this folder

## Purpose

This folder contains the official Product Specification for the Narrowcasting platform. It defines product behaviour, user experience, business workflows, operational expectations, and long-term commercial direction.

The Product Specification complements the technical architecture. Architecture explains how the platform is built. Product documentation explains how the platform behaves and how users experience it.

## Intended Audience

- Product owners use this set to define product direction and behaviour.
- UX designers use it to design workspaces, workflows, and interaction patterns.
- Software architects use it to validate that product behaviour remains aligned with architecture.
- Developers use it as behavioural guidance before implementation.
- AI coding assistants use it as the authoritative product context for future work.

## Reading Order

1. [00 Product Index](00_PRODUCT_INDEX.md)
2. [01 Product Vision](01_PRODUCT_VISION.md)
3. [02 Information Architecture](02_INFORMATION_ARCHITECTURE.md)
4. [03 UX Foundations](03_UX_FOUNDATIONS.md)
5. [04 Workspaces](04_WORKSPACES.md)
6. Read the relevant product-area specification before implementation.
7. [16 Implementation Guidelines](16_IMPLEMENTATION_GUIDELINES.md)

## Product Documents

| Document | Purpose |
| --- | --- |
| [00 Product Index](00_PRODUCT_INDEX.md) | Master entry point, hierarchy, reading order, and relationships. |
| [01 Product Vision](01_PRODUCT_VISION.md) | Mission, philosophy, principles, mental model, and long-term vision. |
| [02 Information Architecture](02_INFORMATION_ARCHITECTURE.md) | Navigation, workspace ownership, business concepts, and runtime concepts. |
| [03 UX Foundations](03_UX_FOUNDATIONS.md) | UX principles, interaction rules, progressive disclosure, and state handling. |
| [04 Workspaces](04_WORKSPACES.md) | Dashboard, Content, Deployment, Publishing, Monitoring, and Administration workspaces. |
| [05 Campaign Lifecycle](05_CAMPAIGN_LIFECYCLE.md) | Campaign states, transitions, validation, rollback, and history. |
| [06 Publishing Specification](06_PUBLISHING_SPECIFICATION.md) | Publishing flow, preview, validation, impact analysis, and resolver relationship. |
| [07 Monitoring & Operations](07_MONITORING_AND_OPERATIONS.md) | Live status, operational health, diagnostics, and activity. |
| [08 Roles & Permissions](08_ROLES_AND_PERMISSIONS.md) | Roles, capabilities, ownership, security principles, and audit responsibilities. |
| [09 Offline & Synchronization](09_OFFLINE_AND_SYNCHRONIZATION.md) | Offline behaviour, sync states, cache validation, and recovery. |
| [10 Alerts & Incidents](10_ALERTS_AND_INCIDENTS.md) | Alerts, incidents, severity, lifecycle, and operational response. |
| [11 Activity Log & Audit](11_ACTIVITY_LOG_AND_AUDIT.md) | Event history, auditability, object timelines, and retention principles. |
| [12 Preview & Simulation](12_PREVIEW_AND_SIMULATION.md) | Resolver-based preview, simulation, explainability, and future playback prediction. |
| [13 Installations & Locations](13_INSTALLATIONS_AND_LOCATIONS.md) | Physical deployment structure, locations, groups, and enterprise scale. |
| [14 Storage & Media Management](14_STORAGE_AND_MEDIA_MANAGEMENT.md) | Media lifecycle, dependency tracking, safe deletion, and cache health. |
| [15 Design System](15_DESIGN_SYSTEM.md) | Visual language, layout rules, components, accessibility, and responsive behaviour. |
| [16 Implementation Guidelines](16_IMPLEMENTATION_GUIDELINES.md) | Development process, architecture compliance, documentation rules, and stable releases. |

## Relationship With Architecture

The architecture documentation remains the technical authority. The Product Specification is the behavioural authority. Future implementation must satisfy both.

```text
Architecture
->
Product Specification
->
Implementation
```

The Scheduler Resolver remains the runtime authority. Product workflows may explain scheduling behaviour, but they must not bypass or duplicate resolver logic.

## Relationship With Implementation

Implementation work should begin only after the relevant product behaviour is defined. Significant features should identify:

- the owning workspace;
- the relevant Product Specification document;
- the relevant architecture document;
- required validation and monitoring behaviour;
- acceptance and verification criteria.

Future engineering contracts will live in `../implementation/`.

## Relationship With Stable Tags

Stable tags represent verified implementation milestones. A stable tag should only be created when implementation, verification, architecture documentation, and product documentation are aligned.
