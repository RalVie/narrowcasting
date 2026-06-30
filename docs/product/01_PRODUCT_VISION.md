# Narrowcasting Product Vision

- **Document ID:** PRODUCT-001
- **Version:** 3.0 (Draft)
- **Status:** Design Specification
- **Audience:** Product Owners, UX Designers, Software Architects, Developers

---

## 1. Purpose

This document defines the long-term vision of the Narrowcasting platform.

It is the highest-level specification within the product documentation.

Architecture documents explain how the platform is built.

This document explains why the platform exists, how users experience it, and which principles guide every future design decision.

All UX, workflows, page layouts and implementation decisions SHALL remain consistent with this document.

## 2. Mission

The mission of Narrowcasting is:

To make professional digital signage easy to understand, safe to operate and scalable from a single display to thousands of displays without changing the operator's mental model.

The platform should never expose technical complexity unless explicitly requested.

Users should think in business concepts.

The system translates those concepts into runtime behaviour.

## 3. Vision

The product should feel like professional enterprise software.

Examples of products with similar design philosophy include:

VMware vCenter

UniFi Network Controller

Microsoft Intune

Visual Studio Code

Azure Portal

Not because they look the same, but because they share important characteristics:

predictable navigation

workspace-oriented design

progressive disclosure

excellent diagnostics

scalable management

safe administration

## 4. Product Philosophy

### 4.1 Business First

Users work with business concepts.

Examples:

Media

Playlist

Program

Campaign

Screen

Screen Group

They should rarely encounter runtime concepts.

Examples:

Assignments

Scheduler Candidates

Priority Engine

Resolver Trace

Resolved Schedule

These remain implementation details.

### 4.2 Explainable

Every action must be explainable.

At any moment the system should answer:

- What is playing?
- Why is it playing?
- What will play next?
- Why was another campaign rejected?

This philosophy is one of the defining characteristics of Narrowcasting.

### 4.3 Local First

The platform is designed to operate without permanent internet connectivity.

Cloud functionality is optional.

The product must remain operational when offline.

### 4.4 Safe Publishing

Publishing content should never be a risky action.

Before publication the system validates:

missing media

empty programs

unavailable themes

offline screens

invalid schedule windows

deployment conflicts

The user should know about problems before publishing, not afterwards.

### 4.5 Operational Confidence

Operators should always know:

system health

deployment health

synchronization state

playback state

campaign state

The platform should never leave users guessing.

## 5. Target Users

Installer

Responsible for:

registering players

approving screens

deployment structure

hardware diagnostics

Content Manager

Responsible for:

media

playlists

programs

themes

Does not require runtime knowledge.

Campaign Manager

Responsible for:

campaign creation

scheduling

publishing

campaign lifecycle

Operator

Responsible for:

monitoring

diagnostics

playback investigation

incident response

Administrator

Responsible for:

system configuration

permissions

storage

maintenance

updates

## 6. Product Mental Model

Users should think in the following sequence:

```text
Create Content

->

Organise Content

->

Build Programs

->

Create Campaign

->

Publish

->

Monitor

->

Investigate (if required)
```

Notice that "Assignments" do not appear.

Neither does "Scheduler Resolver".

Those remain implementation details.

## 7. Product Layers

The product consists of five conceptual layers.

Content

```text
"What do I want to show
->
"
```

Objects:

Media

Playlists

Programs

Themes

Publishing

```text
"When should it be shown
->
"
```

Objects:

Campaigns

Calendar

Publish

Deployment

```text
"Where should it be shown
->
"
```

Objects:

Screens

Screen Groups

Locations (future)

Monitoring

```text
"What is happening
->
"
```

Objects:

Live Status

Alerts

Diagnostics

Activity Log

Administration

```text
"How is the platform configured
->
"
```

Objects:

Users

Settings

Storage

Updates

## Advanced

## 8. Product Principles

The following principles SHALL guide all future development.

PP-001

The platform SHALL remain understandable without explaining its implementation.

PP-002

Business concepts SHALL always take precedence over runtime concepts.

PP-003

Runtime concepts SHALL remain available for diagnostics.

They SHALL NOT dominate normal workflows.

PP-004

The Scheduler Resolver SHALL remain the single authority responsible for runtime scheduling.

The user interacts with Campaigns.

Never with Scheduler Candidates.

PP-005

Publishing SHALL be safe.

The platform validates before activation.

PP-006

Diagnostics SHALL explain behaviour.

Diagnostics SHALL NOT change behaviour.

PP-007

Every page SHALL have one responsibility.

PP-008

Progressive Disclosure SHALL be applied throughout the product.

PP-009

The platform SHALL scale from:

1 screen

10 screens

100 screens

1000 screens

multiple installations

without changing its mental model.

PP-010

Future features SHALL integrate into the existing architecture rather than replacing it.

## 9. Success Criteria

A first-time customer should be able to:

register a screen

upload media

build a playlist

build a program

create a campaign

publish safely

understand playback

investigate problems

without reading technical documentation.

## 10. Definition of Product Success

The product is successful when:

installers can deploy quickly

operators trust the platform

marketing can publish confidently

administrators can manage growth

diagnostics reduce support effort

the architecture remains stable for years

## 11. Relationship with the Architecture

The Product Specification defines:

user experience

workflows

navigation

terminology

behaviour

The Architecture defines:

implementation

runtime

scheduling

player behaviour

persistence

Neither document overrides the other.

Both together define the Narrowcasting platform.

---

## Document Navigation

- **Previous:** 00_PRODUCT_INDEX.md
- **Next:** 02_INFORMATION_ARCHITECTURE.md
- **Related specifications:** 00_PRODUCT_INDEX.md, 02_INFORMATION_ARCHITECTURE.md, ../architecture/ARCHITECTURE.md
