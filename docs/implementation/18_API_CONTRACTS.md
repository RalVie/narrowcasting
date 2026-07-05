# Narrowcasting API Contracts

- **Document ID:** IMPLEMENTATION-018
- **Version:** 1.0 (Draft)
- **Status:** Engineering Contract
- **Layer:** Implementation Contracts

---

## 1. Purpose

This document defines the canonical engineering contract for APIs within the Narrowcasting platform.

It defines API principles, resource conventions, request and response contracts, validation boundaries, concurrency expectations, offline behaviour, security considerations, versioning, and the relationship between APIs and the Scheduler Resolver.

This document is technology-independent. It does not define controller code, database access, serialization libraries, OpenAPI generation, REST implementation details, GraphQL schemas, or authentication implementation.

## 2. Position In The Documentation Hierarchy

```text
Architecture
->
Product Specification
->
Implementation Contracts
->
Implementation
```

Architecture defines technical boundaries and runtime authority.

Product Specification defines user-facing behaviour and workflows.

The Domain Model defines entities, ownership, identity, lifecycle, and validation responsibilities.

This API Contract defines how those domain concepts are exposed and exchanged through stable interfaces.

## 3. Relationship To Architecture

This document must remain consistent with:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)

The following architecture rules are binding for APIs:

- Playback is always local.
- Player-facing APIs return resolved schedules and local-cacheable references only.
- The Scheduler Resolver remains the single runtime authority.
- APIs must not introduce alternate scheduling paths.
- Diagnostics APIs may explain runtime behaviour, but must not change it.
- Management APIs are optional from the Player's perspective; playback must continue without them.

## 4. Relationship To Product Specification

This document must remain consistent with:

- [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
- [`../product/02_INFORMATION_ARCHITECTURE.md`](../product/02_INFORMATION_ARCHITECTURE.md)
- [`../product/04_WORKSPACES.md`](../product/04_WORKSPACES.md)
- [`../product/05_CAMPAIGN_LIFECYCLE.md`](../product/05_CAMPAIGN_LIFECYCLE.md)
- [`../product/06_PUBLISHING_SPECIFICATION.md`](../product/06_PUBLISHING_SPECIFICATION.md)
- [`../product/08_ROLES_AND_PERMISSIONS.md`](../product/08_ROLES_AND_PERMISSIONS.md)
- [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md)
- [`../product/11_ACTIVITY_LOG_AND_AUDIT.md`](../product/11_ACTIVITY_LOG_AND_AUDIT.md)

Product workspaces define user intent and workflow ownership. APIs must respect that ownership.

Examples:

- Content APIs expose Media, Playlists, Programs, and Themes.
- Publishing APIs expose Campaigns and publishing lifecycle actions.
- Deployment APIs expose Screens and Screen Groups.
- Runtime APIs expose Assignments and Scheduler diagnostics only where appropriate.
- Player APIs expose schedule retrieval, synchronization, heartbeat, and playback status.

## 5. Relationship To Domain Model

This document extends [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md).

The Domain Model defines what entities are and which layer owns them. This API Contract defines how those entities are represented across service boundaries.

Domain Models and API DTOs are related but not identical.

Domain Models protect invariants.

API DTOs protect compatibility, transport clarity, and client-facing stability.

---

## 6. Design Principles

### 6.1 API-First Development

APIs are contracts, not incidental controller outputs.

Before implementation, every significant API change should define:

- resource ownership;
- request shape;
- response shape;
- validation behaviour;
- error behaviour;
- authorization expectations;
- compatibility impact.

### 6.2 Stable Contracts

Once published, an API contract should remain stable.

Breaking changes require:

- explicit versioning or migration plan;
- documentation update;
- client impact review;
- deprecation path where applicable.

### 6.3 Backward Compatibility

APIs should evolve additively.

Compatible changes include:

- adding optional response fields;
- adding optional request fields;
- adding new endpoints;
- adding new enum values only when clients are expected to handle unknown values safely.

Potentially breaking changes include:

- renaming fields;
- removing fields;
- changing field semantics;
- changing identity fields;
- changing lifecycle state names;
- changing error formats;
- changing schedule output semantics.

### 6.4 Stateless Communication

API requests should be stateless unless the domain operation explicitly represents state transition.

Clients should not rely on hidden server-side UI session state for domain behaviour.

State transitions must be explicit in request intent and auditable where required.

### 6.5 Predictable Resource Naming

Resource names must be consistent, plural, stable, and domain-oriented.

APIs should expose business concepts before implementation concepts.

Runtime concepts may be exposed through diagnostics or advanced APIs only.

### 6.6 Consistent Request And Response Formats

APIs should use consistent:

- identifier naming;
- timestamp formats;
- pagination metadata;
- validation error shape;
- problem details;
- object envelopes where adopted;
- collection metadata.

### 6.7 Idempotent Operations Where Appropriate

Operations that can safely be repeated should be designed as idempotent.

Examples:

- replace a resource;
- set enabled state;
- assign a known relationship;
- acknowledge an already acknowledged alert.

Operations that create new identities or lifecycle events may be non-idempotent unless an idempotency key strategy is defined.

### 6.8 Separation Between Domain Models And DTOs

API DTOs must not expose internal persistence shape by accident.

DTOs may:

- flatten related display fields;
- hide internal-only fields;
- include computed metadata;
- preserve compatibility fields;
- expose diagnostic data read-only.

DTOs must not:

- become the domain model;
- bypass domain validation;
- leak storage details;
- expose mutable runtime internals as normal workflow fields.

### 6.9 Explicit Empty States

APIs must distinguish:

- missing resource;
- empty collection;
- valid empty schedule;
- failed synchronization;
- disabled assignment;
- unauthorized access.

An empty schedule is valid and must not be treated as stale data.

---

## 7. API Categories

## 7.1 Business APIs

Business APIs expose user-facing content and publishing objects.

Owned by:

- Content Workspace;
- Publishing Workspace.

Resource families:

- Media;
- Playlists;
- Programs;
- Themes;
- Campaigns.

Business APIs must not expose current Player cache state as authoritative source data.

## 7.2 Deployment APIs

Deployment APIs expose where playback can happen.

Owned by:

- Deployment Workspace.

Resource families:

- Screens;
- Screen Groups;
- future Installations;
- future Locations.

Deployment APIs may expose operational status summaries, but must distinguish source identity from runtime status.

## 7.3 Runtime APIs

Runtime APIs expose advanced runtime bindings, resolver behaviour, and resolved output.

Owned by:

- Runtime Layer;
- Monitoring and Diagnostics where read-only.

Resource families:

- Assignments;
- Scheduler Resolver diagnostics;
- Resolved Schedules;
- Scheduler traces.

Runtime APIs must not become normal content-editing workflows.

## 7.4 Player APIs

Player APIs support local-first playback.

Resource families:

- Schedule retrieval;
- synchronization;
- status reporting;
- heartbeats;
- diagnostics.

Player-facing APIs must return only the information needed for local playback, synchronization, and monitoring.

Players must not receive Campaigns, Assignments, group membership rules, priorities, or unresolved scheduling rules.

## 7.5 Administration APIs

Administration APIs expose system-level information and configuration.

Resource families:

- health;
- monitoring;
- configuration;
- version;
- system information;
- future users and permissions;
- future updates and maintenance.

Administration APIs must not become a dumping ground for business workflows.

---

## 8. Resource Naming

This document defines naming rules, not an exhaustive endpoint list.

### 8.1 Collections

Collections should use plural resource names.

Examples:

```text
/media
/playlists
/programs
/themes
/campaigns
/screens
/screen-groups
/assignments
```

Collection names should be stable and domain-oriented.

### 8.2 Individual Resources

Individual resources should be addressed by immutable ID.

Pattern:

```text
/{collection}/{id}
```

Examples:

```text
/media/{mediaId}
/playlists/{playlistId}
/screens/{screenId}
```

IDs in paths must be stable identifiers, not names, filenames, or array indexes.

### 8.3 Nested Resources

Nested resources are appropriate when the child resource has no meaningful identity outside the parent context or when the operation is clearly scoped.

Examples:

```text
/screens/{screenId}/heartbeat
/screens/{screenId}/assignment
/campaigns/{campaignId}/history
```

Nested resources must not obscure ownership. If a child object is independently owned, it should also have a top-level resource family.

### 8.4 Relationship Endpoints

Relationship endpoints should express relationship intent clearly.

Examples of relationship intent:

```text
add screen to group
remove screen from group
assign program to target
publish campaign
pause campaign
```

Relationship operations should preserve stable IDs and avoid replacing entire objects unless the operation explicitly does so.

### 8.5 Action Names

Action-style endpoints may be used for lifecycle transitions or domain commands.

Examples of valid domain actions:

- publish;
- pause;
- resume;
- archive;
- validate;
- rollback;
- approve;
- acknowledge;
- resolve.

Action endpoints should represent domain language, not implementation details.

### 8.6 Naming Consistency

Use consistent terminology:

- `media`, not files, for business media assets;
- `web_url` and `rss_feed` for dynamic Media types;
- `rss_item` for server-resolved RSS schedule output;
- `browserActions` for Browser Automation configuration on Web URL Media;
- `playlist`, not list, for ordered media;
- `program`, not schedule, for ordered playlists;
- `campaign`, not assignment, for publishing intent;
- `screen`, not player, for deployment endpoint;
- `player`, only for runtime software/status;
- `agent`, for local synchronization, Browser Renderer control, Browser Automation execution and runtime recovery;
- `screen-group`, not group, when ambiguity is possible;
- `resolved-schedule`, not campaign schedule, for Scheduler Resolver output.

Dynamic Media APIs must preserve the boundary between business configuration and runtime output:

- Web URL Media stores URL, duration, optional title, render mode and optional Browser Automation actions.
- RSS Feed Media stores feed URL, duration per resolved item, max items and optional title.
- RSS fetching/parsing is server-side.
- Resolved schedules contain concrete `web_url` or `rss_item` instructions.
- Player/Agent APIs must not expose raw Campaigns, Assignments or unresolved RSS rules to the Player.

---

## 9. HTTP Principles

HTTP semantics are described here as contract guidance. Future GraphQL, gRPC, or event APIs must preserve the same domain intent.

### 9.1 GET

`GET` retrieves resources or computed read-only views.

Expected semantics:

- safe;
- read-only;
- no domain mutation;
- cacheable where appropriate;
- may produce audit/diagnostic access logs if required.

`GET` must not trigger publish, sync activation, deletion, or lifecycle transition.

### 9.2 POST

`POST` creates resources or executes domain commands.

Expected semantics:

- may be non-idempotent;
- may create new identity;
- may create events;
- may trigger validation;
- may represent lifecycle transition.

Where repeated execution would be risky, future implementations should support idempotency keys or conflict detection.

### 9.3 PUT

`PUT` replaces a known resource or known full representation.

Expected semantics:

- idempotent when used correctly;
- caller supplies complete replacement state;
- missing fields may be interpreted as intentionally absent only if contract says so.

`PUT` must be used carefully for objects with optional forward-compatible fields. It must not accidentally discard unknown fields unless the API contract explicitly defines replacement semantics.

### 9.4 PATCH

`PATCH` partially updates a resource.

Expected semantics:

- may be idempotent depending on patch form;
- caller supplies only changed fields;
- preserves unspecified fields;
- should be preferred when preserving unknown or optional fields is important.

Patch semantics must be documented before use.

### 9.5 DELETE

`DELETE` removes, disables, or archives a resource depending on domain policy.

Expected semantics:

- should be idempotent where practical;
- must validate references before destructive removal;
- may be forbidden when archive is preferred;
- must create audit events for privileged or destructive operations.

The API contract must distinguish hard delete from archive, disable, or detach.

---

## 10. Request Contracts

## 10.1 Identifiers

Requests must use stable IDs.

Rules:

- IDs should be strings.
- Clients must not assume numeric or sequential IDs.
- Display names must not be used as identifiers.
- Filenames must not be used as Media identity.
- Array indexes must not be used as item identity.

## 10.2 Timestamps

Timestamps should use ISO 8601 format.

APIs must document whether timestamps are:

- server-generated;
- client-provided;
- local time;
- UTC;
- display-only.

Future time-zone support must not require changing existing timestamp semantics.

## 10.3 Pagination

Collection APIs expected to grow must support pagination.

Request conventions may include:

- page number;
- page size;
- cursor;
- limit;
- offset.

The chosen convention must be consistent within each API family.

Pagination is required for enterprise-scale collections such as Media, Screens, Campaigns, Activity, Alerts, and Audit.

## 10.4 Filtering

Filtering should be explicit and field-based.

Examples of filter categories:

- type;
- status;
- owner;
- lifecycle state;
- target type;
- date range;
- installation;
- location;
- group;
- health state.

Filters must not change resource semantics. They only reduce the returned set.

## 10.5 Sorting

Sorting should be explicit.

Sort fields must be documented and stable.

Clients must not rely on implicit storage order.

Default sort order should be documented for every collection.

## 10.6 Searching

Search should be separate from exact filtering.

Search may match:

- names;
- descriptions;
- filenames;
- tags;
- metadata.

Search behaviour may evolve, so APIs should avoid promising database-specific search semantics unless intentionally defined.

## 10.7 Includes And Expansion

APIs may allow clients to include or expand related objects.

Rules:

- Includes must be explicit.
- Default responses should remain predictable.
- Expansions must not cross ownership boundaries in a way that implies mutation.
- Expanded data is a view, not ownership transfer.

Example concepts:

```text
include=usage
include=relationships
include=diagnostics
expand=program
expand=theme
```

## 10.8 Field Selection

Future APIs may support selecting fields.

Field selection must not alter validation or domain behaviour.

It should be used for performance and client-specific views only.

## 10.9 Bulk Operations

Bulk operations are required for enterprise scale.

Bulk APIs must define:

- maximum item count;
- partial success behaviour;
- validation strategy;
- error reporting per item;
- idempotency expectation;
- audit event strategy.

Bulk operations must not bypass domain validation.

## 10.10 Command Requests

Lifecycle transitions and domain actions should use command-style request DTOs.

Command requests should include:

- target ID;
- expected version where required;
- reason or note where audit requires it;
- command-specific options;
- idempotency key where appropriate.

---

## 11. Response Contracts

## 11.1 Success Responses

Success responses must be predictable.

They should return one of:

- resource representation;
- collection representation;
- command result;
- empty success for operations where body adds no value.

For lifecycle commands, response should make the resulting state clear.

## 11.2 Collection Responses

Collection responses should support metadata.

Metadata may include:

- total count where available;
- page size;
- cursor;
- next cursor;
- filter summary;
- sort summary.

Large collections must not require clients to load all items.

## 11.3 Object Envelopes

If object envelopes are adopted, they must be consistent.

Example envelope concepts:

```json
{
  "data": {},
  "meta": {},
  "links": {}
}
```

This document does not require envelopes, but it requires consistency once a pattern is chosen.

## 11.4 Error Responses

Error responses must be consistent and machine-readable.

Every error should communicate:

- what happened;
- why it happened;
- how the client or user can recover;
- correlation or trace reference where available.

## 11.5 Problem Details Style

APIs should be compatible with a Problem Details style shape.

Conceptual fields:

- type;
- title;
- status;
- detail;
- instance;
- code;
- correlationId;
- errors.

This document does not require a specific serialization standard, but error shape must be stable.

## 11.6 Validation Errors

Validation errors should support field-level and object-level errors.

Each validation error should include:

- field path where applicable;
- error code;
- readable message;
- severity where applicable;
- rejected value only when safe to expose;
- remediation hint where useful.

Validation error codes must be stable enough for clients to handle.

## 11.7 Metadata

Responses may include metadata for:

- version;
- updated timestamp;
- generated timestamp;
- source;
- permissions;
- warnings;
- diagnostics links.

Metadata must not hide required domain fields.

## 11.8 Empty Responses

Empty collection:

```json
{
  "data": [],
  "meta": {}
}
```

Valid empty schedule:

```json
{
  "items": []
}
```

Empty does not mean failed.

APIs must distinguish empty from error.

---

## 12. Validation Responsibilities

Validation responsibilities are layered.

### 12.1 Client Validation

Client validation improves usability.

It may check:

- required fields;
- basic formats;
- simple ranges;
- local draft consistency;
- confirmation before destructive actions.

Client validation is never authoritative.

### 12.2 API Validation

API validation protects contract boundaries.

It must check:

- request shape;
- content type;
- supported fields;
- required IDs;
- enum values;
- pagination bounds;
- authentication and authorization where applicable.

API validation should reject malformed requests before domain processing.

### 12.3 Domain Validation

Domain validation protects business rules.

It must check:

- lifecycle transition validity;
- reference integrity;
- ownership rules;
- safe deletion;
- publish blockers;
- assignment target validity;
- schedule intent validity.

Domain validation remains authoritative.

### 12.4 Runtime Validation

Runtime validation protects Resolver output.

It must check:

- active/inactive status;
- time-window validity;
- target match;
- candidate validity;
- deterministic winner selection;
- resolved schedule integrity.

Runtime validation belongs to candidate generation and the Scheduler Resolver, not UI or Player logic.

---

## 13. Concurrency

## 13.1 Versioning

Mutable resources should expose a version marker.

Version markers may be:

- numeric version;
- updated timestamp;
- entity tag;
- content signature;
- revision ID.

This document does not mandate which mechanism is used.

## 13.2 Optimistic Locking

APIs should support optimistic locking for resources edited by multiple operators.

Affected resources include:

- Playlists;
- Programs;
- Themes;
- Campaigns;
- Screen metadata;
- Screen Groups;
- Assignments;
- future Installations and Locations.

Clients should be able to submit an expected version. The API should reject stale writes with a conflict response.

## 13.3 Conflict Detection

Conflict responses should identify:

- conflicted resource;
- expected version;
- current version;
- whether retry is safe;
- whether manual merge is needed.

The API should not silently overwrite newer user changes.

## 13.4 Publish Conflicts

Publishing conflicts are domain conflicts, not generic write conflicts.

Examples:

- Campaign overlaps with another active campaign;
- target conflict;
- priority conflict;
- missing media introduced after validation;
- offline or unsynchronized target warnings;
- stale campaign revision.

Publishing APIs must return enough detail for the Publishing UX to explain the impact.

## 13.5 Idempotency Keys

Future APIs should support idempotency keys for operations where retries may duplicate work.

Examples:

- media upload completion;
- campaign publish;
- rollback;
- bulk operations;
- external integration callbacks.

Idempotency keys must not weaken validation or authorization.

---

## 14. Offline Behaviour

## 14.1 Synchronization

Player synchronization APIs must support local-first playback.

Rules:

- failed schedule fetch must not erase the current local schedule;
- valid empty schedule must overwrite stale local schedule;
- schedule changes must be detectable by version, timestamp, or signature;
- media references must be local-cacheable;
- required static theme media must be discoverable for cache sync.

## 14.2 Delta Updates

Future APIs may support delta updates.

Delta updates must preserve:

- correctness;
- ordering;
- reference integrity;
- validation before activation;
- ability to recover with full refresh.

Delta sync must never become the only way to reconstruct local state.

## 14.3 Retry Behaviour

Clients should be able to retry safe operations.

Retry guidance:

- repeat `GET` safely;
- repeat idempotent writes safely;
- use idempotency keys for risky commands;
- preserve local playback on sync failure;
- report repeated failure as operational state.

## 14.4 Conflict Handling

Offline or delayed clients may submit stale data.

APIs must detect stale writes where resource versioning applies.

Player sync conflicts should prefer playback continuity:

```text
invalid new schedule -> keep last valid schedule
failed fetch -> keep last valid schedule
valid empty schedule -> activate empty state
valid changed schedule -> synchronize and activate
```

## 14.5 Eventual Consistency

Monitoring and dashboard views may be eventually consistent.

Player playback correctness must not depend on dashboards being current.

APIs should expose timestamps and status markers so operators can understand staleness.

---

## 15. Security Considerations

This section defines API security contracts without choosing authentication technology.

### 15.1 Authentication

APIs should support a future authentication layer.

Authentication identifies:

- human user;
- service account;
- player/device;
- integration client.

This contract does not define JWT, OAuth, sessions, API keys, certificates, or identity providers.

### 15.2 Authorization

Authorization must be permission-based.

Permissions should align with Product roles and capability categories:

- Content;
- Publishing;
- Deployment;
- Monitoring;
- Administration;
- System.

APIs must not rely only on UI hiding unavailable actions.

### 15.3 Player Trust

Player-facing APIs should distinguish trusted Player identity from normal dashboard user identity.

Players may need permission to:

- retrieve resolved schedules;
- retrieve media;
- report heartbeat;
- report sync status;
- report playback status.

Players must not receive permission to edit Campaigns, Assignments, or business objects.

### 15.4 Auditability

Privileged API operations must produce audit-capable events.

Examples:

- publish campaign;
- pause/resume campaign;
- delete/archive media;
- approve screen;
- change permissions;
- modify assignment;
- resolve alert;
- change system configuration.

Audit events must include actor, target, action, result, and timestamp.

### 15.5 Sensitive Data

APIs must avoid exposing sensitive implementation details in error messages.

Error responses should expose recovery information without leaking:

- secrets;
- filesystem paths unless safe and intended;
- stack traces;
- internal tokens;
- private network details where inappropriate.

---

## 16. Versioning Strategy

## 16.1 Versioning Philosophy

API versioning should protect clients while allowing the product to evolve.

The preferred strategy is additive evolution within a stable major version.

Major breaking changes require explicit version boundary.

## 16.2 Backward Compatibility

Backward-compatible changes should be preferred.

Clients should tolerate:

- unknown optional fields;
- unknown enum values where documented;
- additional metadata;
- additional links;
- new resource types in future extension points.

## 16.3 Deprecation Policy

Deprecation should include:

- documented replacement;
- migration guidance;
- timeline where applicable;
- diagnostics or warnings where appropriate.

Deprecated APIs should remain stable until removal.

## 16.4 Evolution Strategy

Future evolution should support:

- public API exposure;
- enterprise integrations;
- cloud services;
- additional players;
- API gateways;
- generated client SDKs;
- OpenAPI or GraphQL contracts.

Evolution must preserve the domain ownership and Scheduler Resolver boundaries.

---

## 17. Relationship With Scheduler Resolver

The Scheduler Resolver remains the runtime authority.

APIs may:

- create or edit business intent;
- create or edit deployment context;
- create or edit runtime inputs;
- expose resolver diagnostics;
- expose resolved schedules.

APIs must not:

- duplicate Resolver logic in dashboard endpoints;
- allow Player to calculate schedules;
- expose unresolved Campaign/Assignment logic to Player playback;
- let Screen or Screen Group APIs decide playback directly;
- let Campaign APIs generate final schedules directly.

Correct runtime API flow:

```text
Business + Deployment + Runtime Inputs
->
Scheduler Resolver
->
Resolved Schedule API
->
Player/Agent Sync
->
Local Playback
```

Diagnostics flow:

```text
Screen Context
->
Scheduler Resolver Diagnostics
->
Trace / Candidates / Winner / Rejection Reasons
->
Read-only Dashboard View
```

Diagnostics explain behaviour. They do not change behaviour.

---

## 18. Future Compatibility

## 18.1 GraphQL

Future GraphQL APIs must preserve:

- domain ownership;
- stable IDs;
- lifecycle boundaries;
- separation between source entities and resolved output;
- read-only diagnostics.

GraphQL must not encourage clients to assemble their own schedule logic from raw business objects.

## 18.2 gRPC

Future gRPC APIs should map to the same domain commands, queries, DTOs, and error model.

Transport changes must not change domain semantics.

## 18.3 Event APIs

Future event APIs may publish:

- business events;
- deployment events;
- runtime events;
- player events.

Events must be clearly separated from commands.

Receiving an event is not the same as being authorized to mutate state.

## 18.4 Public APIs

Future public APIs must be stricter than internal APIs.

They should define:

- explicit authentication;
- explicit scopes;
- rate limits;
- stable versioning;
- deprecation policy;
- audit expectations.

## 18.5 Enterprise Integrations

Enterprise integrations may include:

- identity providers;
- content systems;
- alerting systems;
- reporting systems;
- device management;
- storage providers.

Integrations must use the API contracts without bypassing Product or Architecture boundaries.

---

## 19. Out Of Scope

This document does not define:

- endpoint implementations;
- controller code;
- database access;
- ORM usage;
- serialization libraries;
- authentication implementation;
- authorization implementation;
- OpenAPI generation;
- GraphQL implementation;
- gRPC implementation;
- queue implementation;
- client SDK implementation;
- UI code.

Those belong in future implementation tasks or more specific engineering contracts.

---

## 20. Definition Of Done

An API design is complete only when:

- it has an owning documentation layer;
- it maps to the Domain Model;
- it respects Architecture boundaries;
- it supports Product workflows;
- it defines request and response contracts;
- it defines validation behaviour;
- it defines error behaviour;
- it defines authorization expectations where applicable;
- it preserves Scheduler Resolver authority;
- it supports local-first playback where player-facing;
- it includes compatibility and versioning considerations;
- it avoids implementation-specific storage or framework assumptions.

Before implementation starts, API designs should be reviewed against:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)
- [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md)
- relevant Product Specification documents.

---

## 21. Contract Summary

The Narrowcasting API model is layered:

```text
Business APIs
Deployment APIs
Runtime APIs
Player APIs
Administration APIs
```

The core rule is:

```text
APIs expose domain intent and runtime output.
APIs do not invent domain ownership.
APIs do not duplicate Scheduler Resolver logic.
Players consume resolved schedules only.
```

This contract must remain stable as the product evolves toward public APIs, enterprise integrations, and future API description formats.

---

## Document Navigation

- **Previous:** [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md)
- **Next:** [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md)
- **Related specifications:** [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md), [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
