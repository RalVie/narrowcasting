# Narrowcasting Domain Model

- **Document ID:** IMPLEMENTATION-017
- **Version:** 1.0 (Draft)
- **Status:** Engineering Contract
- **Layer:** Implementation Contracts

---

## 1. Purpose

This document defines the canonical engineering contract for the Narrowcasting domain model.

It translates the stable Architecture and Product Specification into technology-independent implementation guidance. It defines the domain entities, ownership rules, identity rules, lifecycle boundaries, validation responsibilities, and cross-layer relationships that future TypeScript models, APIs, database schemas, and integration contracts must respect.

This document does not redesign the product. It formalizes the existing concepts so implementation can remain consistent as the platform grows.

## 2. Scope

This contract covers the core Narrowcasting domain:

- Business Layer
- Deployment Layer
- Runtime Layer
- Player Layer
- Cross-layer relationships
- Ownership and identity rules
- Lifecycle and validation boundaries
- Event categories
- Engineering mapping guidelines

This contract is intentionally technology-independent. It does not define SQL tables, ORM classes, REST routes, GraphQL schemas, or storage engines.

## 3. Position In The Documentation Hierarchy

```text
Architecture
->
Product Specification
->
Implementation Contracts
->
Implementation
```

Architecture defines how the platform is built and protects runtime boundaries.

Product Specification defines how the platform behaves and how users experience it.

Implementation Contracts define stable engineering agreements used to build the platform without drifting from Architecture or Product.

Implementation realizes all three layers.

## 4. Relationship To Architecture

This document must remain consistent with:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)

The following architectural rules are binding:

- Playback is always local.
- Media must be cached locally before playback.
- The Scheduler Resolver is the single runtime authority that answers: "What should this screen display right now?"
- The player receives only a resolved schedule and local media references.
- The player must not know about Campaigns, Assignments, Screen Groups, priorities, time windows, or conflict resolution.
- Product and management workflows must not bypass the Scheduler Resolver.

## 5. Relationship To Product Specification

This document must remain consistent with:

- [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
- [`../product/01_PRODUCT_VISION.md`](../product/01_PRODUCT_VISION.md)
- [`../product/02_INFORMATION_ARCHITECTURE.md`](../product/02_INFORMATION_ARCHITECTURE.md)
- [`../product/04_WORKSPACES.md`](../product/04_WORKSPACES.md)
- [`../product/05_CAMPAIGN_LIFECYCLE.md`](../product/05_CAMPAIGN_LIFECYCLE.md)
- [`../product/06_PUBLISHING_SPECIFICATION.md`](../product/06_PUBLISHING_SPECIFICATION.md)
- [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md)

Product concepts remain user-facing business concepts. Runtime concepts remain available for diagnostics and implementation, but they must not dominate normal operator workflows.

---

## 6. Design Principles

### 6.1 Single Source Of Truth

Every domain fact has exactly one owning layer and one authoritative owner.

Examples:

- Media metadata is owned by the Business Layer.
- Screen identity is owned by the Deployment Layer.
- Candidate evaluation is owned by the Runtime Layer.
- Cached file presence is owned by the Player Layer.

Derived views may duplicate information for display or diagnostics, but they must not become authoritative.

### 6.2 Clear Ownership

Every entity has one domain owner. Ownership determines:

- which layer may create it;
- which layer may mutate it;
- which layer validates it;
- which layer emits lifecycle events for it.

Cross-layer references are allowed. Cross-layer mutation is not.

### 6.3 Stable Identifiers

Every persisted domain entity must have a stable immutable identifier.

Identifiers must:

- survive renaming;
- survive reordering;
- survive restart;
- be safe to reference from other entities;
- be compatible with future UUID-based storage;
- never depend on display names, filenames, array indexes, or database row order.

### 6.4 Separation Of Business, Deployment, Runtime And Player

Business objects express intent.

Deployment objects describe where content can play.

Runtime objects resolve what should play now.

Player objects represent local playback and synchronization state.

No layer may silently take ownership of another layer's data.

### 6.5 Forward Compatibility

The model must allow future additions without redesign:

- Installations
- Locations
- Tags
- Priority overrides
- Emergency messages
- Maintenance mode
- Approval workflows
- Multiple windows
- Holiday calendars
- External triggers
- API integrations
- Cloud services

Future fields should extend existing concepts rather than replacing them.

### 6.6 Technology Independence

This document defines the domain model, not the persistence model.

It must not require:

- a specific database;
- SQL;
- an ORM;
- REST;
- GraphQL;
- event sourcing;
- a cloud platform.

Implementation may choose those technologies later, but the domain contract must remain stable.

---

## 7. Layered Domain Model

```text
Business Layer
Media -> Playlist -> Program -> Theme -> Campaign

Deployment Layer
Screen -> Screen Group
Future: Installation -> Location -> Screen

Runtime Layer
Assignment -> Scheduler Resolver -> Resolved Schedule -> Schedule Item

Player Layer
Offline Cache -> Synchronization State -> Playback State
```

### 7.1 Business Layer

The Business Layer contains reusable product assets and publishing intent.

Entities:

- Media
- Playlist
- Program
- Theme
- Campaign

The Business Layer must not own runtime state, player state, cache state, or current playback state.

### 7.2 Deployment Layer

The Deployment Layer describes where content can play.

Entities:

- Screen
- Screen Group
- Future: Installation
- Future: Location

Deployment entities may be referenced by publishing or runtime objects, but they do not choose playback by themselves.

### 7.3 Runtime Layer

The Runtime Layer turns business intent and deployment context into one resolved schedule.

Entities and services:

- Assignment
- Scheduler Resolver
- Resolved Schedule
- Schedule Item

Runtime entities may reference business and deployment objects. They must not mutate them.

### 7.4 Player Layer

The Player Layer is local and operational.

Entities and states:

- Offline Cache
- Playback State
- Synchronization State

The Player Layer consumes resolved schedules. It must not resolve campaigns, assignments, priorities, screen groups, or scheduler rules.

---

## 8. Business Layer Entities

## 8.1 Media

### Purpose

Media represents a reusable asset that can be shown by the player or used inside a Theme region.

Supported current media classes include images and videos. Future media classes may include generated assets, remote-source assets, templates, or transcoded variants.

### Owner

Content Workspace.

### Lifecycle

```text
Imported -> Validated -> Available -> Referenced -> Published -> Cached -> Archived -> Deleted
```

Not every media asset passes through every state.

### Immutable Identity

Media has an immutable `mediaId`.

The `mediaId` must not be derived from:

- filename;
- upload path;
- title;
- checksum;
- array index.

### Mutable Properties

Typical mutable properties:

- filename;
- display name;
- media type;
- size;
- duration;
- dimensions;
- tags;
- folder or collection references;
- archive state;
- metadata extracted during validation.

The physical file content may change only through an explicit replace/versioning workflow in future phases.

### Relationships

Media may be referenced by:

- Playlist items;
- Theme regions;
- Campaign validation;
- Resolved Schedule items;
- Player Offline Cache.

### Validation Responsibilities

Media validation must confirm:

- supported media type;
- readable file;
- known size;
- safe filename/path reference;
- usable image or video metadata where available.

Future validation may add checksums, transcoding, duplicate detection, and integrity verification.

### API Implications

APIs that expose Media must use stable `mediaId` references. Filenames may be included for display and local media serving, but they must not be the primary identity.

Deletion APIs must validate references before removing or archiving media.

### Scheduler Implications

The Scheduler Resolver may include Media in a Resolved Schedule only after expanding Programs and Playlists. It must not treat Media as an independently schedulable target.

---

## 8.2 Playlist

### Purpose

Playlist represents an ordered reusable sequence of media items.

Playlists organize media. They do not decide where, when, or why content plays.

### Owner

Content Workspace.

### Lifecycle

```text
Created -> Edited -> Validated -> Used By Program -> Archived -> Deleted
```

### Immutable Identity

Playlist has an immutable `playlistId`.

Playlist item identity must also be stable. Playlist items must not be identified by array index.

### Mutable Properties

Typical mutable properties:

- name;
- description;
- ordered items;
- item duration;
- video duration mode;
- item metadata;
- archive state.

### Relationships

Playlist contains Playlist Items.

Playlist Item references:

- one Media entity;
- item-level playback properties such as duration;
- future item-level metadata.

Playlist may be referenced by one or more Programs.

### Validation Responsibilities

Playlist validation must confirm:

- referenced Media exists;
- item order is valid;
- item duration settings are valid;
- video duration mode is valid;
- empty playlist handling is explicit.

### API Implications

Playlist save operations must preserve unknown and optional item fields unless the API explicitly changes or removes them.

Adding, removing, or reordering items must not reset existing item properties.

### Scheduler Implications

The Scheduler Resolver expands Programs into Playlists and Playlists into Schedule Items. Playlist ordering must be preserved during expansion.

---

## 8.3 Program

### Purpose

Program represents an ordered collection of Playlists. It is the reusable playback composition selected by publishing and runtime rules.

Programs answer: "What sequence should play?"

Programs do not answer: "Where should this play?" or "When should this play?"

### Owner

Content Workspace.

### Lifecycle

```text
Created -> Edited -> Validated -> Used By Campaign Or Assignment -> Archived -> Deleted
```

### Immutable Identity

Program has an immutable `programId`.

Program sequence item identity must be stable.

### Mutable Properties

Typical mutable properties:

- name;
- description;
- ordered playlist references;
- archive state;
- future metadata.

### Relationships

Program contains ordered references to Playlists.

Program may be referenced by:

- Campaign;
- Assignment;
- Scheduler Resolver diagnostics;
- Resolved Schedule source metadata.

### Validation Responsibilities

Program validation must confirm:

- referenced Playlists exist;
- sequence order is valid;
- empty program handling is explicit;
- expanded content can produce Schedule Items when active.

### API Implications

APIs must preserve Program ordering and stable sequence item IDs.

Program APIs must not include Screen-specific runtime state.

### Scheduler Implications

The Scheduler Resolver expands the winning Program into Schedule Items by preserving Program playlist order and Playlist item order.

---

## 8.4 Theme

### Purpose

Theme represents visual presentation: virtual canvas, background, and layout regions.

Themes answer: "How should content be presented?"

### Owner

Content Workspace.

### Lifecycle

```text
Created -> Edited -> Validated -> Used By Campaign Or Scheduler Context -> Archived -> Deleted
```

### Immutable Identity

Theme has an immutable `themeId`.

Theme region identity must be stable.

### Mutable Properties

Typical mutable properties:

- name;
- canvas dimensions;
- orientation;
- background color;
- ordered regions;
- region properties;
- archive state.

### Relationships

Theme contains Theme Regions.

Theme Region may reference:

- Program region;
- Media for Logo or Image regions;
- static Text;
- local Clock configuration;
- future dynamic region sources.

Theme may be referenced by Campaign or runtime scheduling context.

### Validation Responsibilities

Theme validation must confirm:

- canvas dimensions are valid;
- region coordinates and dimensions are valid;
- region type is supported;
- required region properties exist;
- referenced Media exists for media-backed regions;
- at least one safe Program Region exists when required.

### API Implications

Theme APIs must preserve generic `regions[]` shape for forward compatibility.

Unknown future region types must not corrupt existing themes.

### Scheduler Implications

The Scheduler Resolver may attach Theme metadata to the Resolved Schedule. It must not perform visual rendering.

Player rendering consumes Theme JSON but does not own Theme logic.

---

## 8.5 Campaign

### Purpose

Campaign represents business publishing intent.

Campaign answers: "What should be shown, where, when, and under which business conditions?"

Campaigns do not directly control the Player. They provide input to Runtime resolution.

### Owner

Publishing Workspace.

### Lifecycle

```text
Draft -> Ready -> Scheduled -> Live -> Paused -> Expired -> Archived
```

### Immutable Identity

Campaign has an immutable `campaignId`.

Campaign revisions must have stable revision identity if revisioning is implemented.

### Mutable Properties

Typical mutable properties:

- name;
- description;
- lifecycle state;
- Program reference;
- Theme reference;
- target references;
- scheduling intent including Always Active, date range, days of week, and time window;
- priority from 0 to 1000;
- owner;
- revision metadata;
- archive state.

Live campaigns should not be edited directly. Editing a Live campaign should create a revision workflow when revisioning is supported.

### Relationships

Campaign references:

- Program;
- Theme;
- target intent such as Screens, Screen Groups, future Installations or Locations;
- schedule intent such as date ranges, days of week, and time windows;
- priority, future weight, approval, or campaign type metadata.

Campaign may produce or inform Assignments during bridge phases, but it must not generate final schedules directly.

### Validation Responsibilities

Campaign validation must confirm:

- Program exists;
- Program is not invalid or unintentionally empty;
- Theme exists where required;
- targets exist;
- schedule intent is valid;
- priority is valid;
- media dependencies are available;
- critical conflicts are handled by policy.

### API Implications

Campaign APIs must separate draft editing from publishing lifecycle transitions.

APIs must preserve history and support future rollback/revision workflows.

### Scheduler Implications

Campaigns may participate in candidate generation. The Scheduler Resolver remains the authority that decides whether a Campaign affects the current Resolved Schedule.

Campaigns must not bypass Assignments, Candidate evaluation, or Resolver rules.

---

## 9. Deployment Layer Entities

## 9.1 Screen

### Purpose

Screen represents the operator-facing display endpoint.

It is the deployment object users manage. It is distinct from the Player runtime process.

### Owner

Deployment Workspace.

### Lifecycle

```text
Discovered -> Pending -> Approved -> Active -> Disabled -> Retired
```

### Immutable Identity

Screen has an immutable `screenId`.

The `screenId` must remain stable across renaming and dashboard edits.

### Mutable Properties

Typical mutable properties:

- name;
- approval state;
- hostname;
- display metadata;
- group membership;
- future Installation reference;
- future Location reference;
- tags;
- administrative status.

### Relationships

Screen may belong to:

- zero or more Screen Groups today;
- exactly one Installation in future;
- exactly one Location in future.

Screen may be targeted by Assignments or Campaign target intent.

Screen receives Player heartbeat/status information, but heartbeat state is operational data, not business identity.

### Validation Responsibilities

Screen validation must confirm:

- identity is stable;
- approval state is valid;
- names are display-safe;
- group/location references are valid;
- unapproved Screens cannot be used where approval is required.

### API Implications

Screen APIs must separate identity, approval, naming, grouping, and operational heartbeat/status.

### Scheduler Implications

The Scheduler Resolver loads Screen context when resolving a schedule for `screenId`.

Screen specificity may influence candidate ranking, but the Screen itself does not decide playback.

---

## 9.2 Screen Group

### Purpose

Screen Group represents a logical collection of approved Screens.

Groups answer: "Which Screens belong together operationally?"

### Owner

Deployment Workspace.

### Lifecycle

```text
Created -> Edited -> Used By Assignment Or Campaign -> Archived -> Deleted
```

### Immutable Identity

Screen Group has an immutable `screenGroupId`.

### Mutable Properties

Typical mutable properties:

- name;
- description;
- screen membership;
- archive state.

### Relationships

Screen Group references zero or more Screens.

A Screen may belong to multiple Screen Groups unless future product policy changes this rule.

Screen Group may be targeted by Assignments or Campaign target intent.

### Validation Responsibilities

Group validation must confirm:

- referenced Screens exist;
- membership operations only add approved Screens where policy requires approval;
- deleting a group does not delete Screens;
- stale Screen references do not break group APIs.

### API Implications

Group APIs must expose membership clearly and avoid duplicating Screen ownership.

### Scheduler Implications

Group membership provides deployment context for the Scheduler Resolver. Group candidates may match a Screen through membership.

---

## 9.3 Future: Installation

### Purpose

Installation represents one managed physical deployment.

Examples include headquarters, school, hospital, store network, airport, or factory.

### Owner

Deployment Workspace.

### Lifecycle

```text
Created -> Configured -> Deployed -> Operated -> Maintained -> Archived
```

### Immutable Identity

Installation must have an immutable `installationId`.

### Mutable Properties

Future properties may include:

- name;
- description;
- operational metadata;
- default settings;
- archive state.

### Relationships

Installation contains Locations and Screens.

Future rule: every Screen should belong to exactly one Installation.

### Validation Responsibilities

Installation validation must ensure physical ownership is unambiguous.

### API Implications

Future APIs should support filtering, bulk operations, and health rollups by Installation.

### Scheduler Implications

Installation may become a future target context or filtering dimension, but it must still be evaluated through the Scheduler Resolver.

---

## 9.4 Future: Location

### Purpose

Location represents a physical place inside an Installation.

Examples include building, floor, department, lobby, reception, restaurant, or production hall.

### Owner

Deployment Workspace.

### Lifecycle

```text
Created -> Organized -> Used By Screens -> Archived
```

### Immutable Identity

Location must have an immutable `locationId`.

### Mutable Properties

Future properties may include:

- name;
- description;
- parent Location;
- ordering;
- archive state.

### Relationships

Location may contain child Locations and Screens.

Future rule: every Screen should belong to exactly one Location.

### Validation Responsibilities

Location validation must prevent invalid hierarchy cycles and ambiguous ownership.

### API Implications

Future APIs should support hierarchical navigation and filtering.

### Scheduler Implications

Location may become a future target context or impact-analysis dimension. It must not bypass the Scheduler Resolver.

---

## 10. Runtime Layer Entities

## 10.1 Assignment

### Purpose

Assignment is a runtime binding between a target and a Program.

Assignments are mechanical runtime objects. They are not normal operator-facing business workflows.

### Owner

Runtime Layer.

### Lifecycle

```text
Created -> Enabled -> Evaluated -> Disabled -> Deleted
```

### Immutable Identity

Assignment has an immutable `assignmentId`.

### Mutable Properties

Typical mutable properties:

- target type;
- target ID;
- Program reference;
- enabled state;
- optional schedule window;
- priority;
- source metadata;
- updated timestamp.

### Relationships

Assignment references:

- one target, such as Screen or Screen Group;
- one Program;
- optional schedule/time-window data.

Assignments may be created manually or derived from Campaign workflows in bridge phases. Source metadata must preserve that origin.

### Validation Responsibilities

Assignment validation must confirm:

- target exists;
- target type is supported;
- Program exists;
- enabled state is explicit;
- optional schedule window is valid;
- priority is numeric and deterministic.

### API Implications

Assignment APIs must be treated as advanced/runtime APIs. Normal operator workflows should create business intent through Campaigns where applicable.

### Scheduler Implications

Candidate generation converts valid Assignments into Scheduler Candidates.

The Scheduler Resolver receives only valid candidates and selects the highest-ranked valid candidate according to resolver rules.

---

## 10.2 Scheduler Resolver

### Purpose

Scheduler Resolver is the single runtime authority that determines what a Screen should display right now.

It is a service/domain process, not a user-editable business object.

### Owner

Runtime Layer.

### Lifecycle

The Resolver has no persisted lifecycle of its own.

Each resolution operation has an execution lifecycle:

```text
Load Context -> Collect Inputs -> Produce Candidates -> Filter -> Rank -> Select Winner -> Generate Resolved Schedule -> Trace Decision
```

### Immutable Identity

The Resolver may expose a resolver version for diagnostics, but it does not require an entity ID.

### Mutable Properties

The Resolver should not own mutable product state.

Rules may evolve by versioned implementation, configuration, or future rule contracts.

### Relationships

Resolver consumes:

- Screen context;
- Screen Group membership;
- Assignments;
- future Campaign candidates;
- future Overrides;
- future Fallback rules;
- current time.

Resolver produces:

- one winning candidate or no candidate;
- one Resolved Schedule;
- diagnostic trace.

### Validation Responsibilities

Resolver validation confirms runtime inputs are usable at resolution time.

It must not mutate invalid source objects.

### API Implications

Player-facing APIs must return only Resolved Schedule output.

Diagnostics APIs may expose Resolver trace, candidates, rejection reasons, and raw JSON, but remain read-only.

### Scheduler Implications

The Resolver is the scheduler authority.

No other layer may independently decide final playback.

---

## 10.3 Resolved Schedule

### Purpose

Resolved Schedule is the final playback instruction produced by the Scheduler Resolver.

It is the only schedule form the Player consumes.

### Owner

Runtime Layer produces it.

Player Layer caches and consumes it.

### Lifecycle

```text
Generated -> Synchronized -> Cached -> Active -> Replaced -> Retired
```

### Immutable Identity

Each generated Resolved Schedule should have a stable version, timestamp, content signature, or equivalent immutable identity for change detection.

### Mutable Properties

A generated Resolved Schedule should be treated as immutable. New resolver output should produce a new version/signature rather than mutating an active schedule in place.

### Relationships

Resolved Schedule references:

- resolved source metadata;
- Theme data;
- Schedule Items;
- required Media files;
- optional diagnostics metadata where safe.

### Validation Responsibilities

Resolved Schedule validation must confirm:

- schedule structure is valid;
- item list is present, including valid empty `items: []`;
- media references are local-cacheable;
- theme metadata is renderable or safely optional;
- player can distinguish empty schedule from failed synchronization.

### API Implications

The schedule API consumed by Player/Agent must not expose Campaign, Assignment, priority, conflict-resolution internals, or unresolved rules.

### Scheduler Implications

Resolved Schedule is produced only by Scheduler Resolver.

---

## 10.4 Schedule Item

### Purpose

Schedule Item represents a single playable item inside a Resolved Schedule.

### Owner

Runtime Layer produces it.

Player Layer consumes it.

### Lifecycle

```text
Generated -> Cached Dependencies Ready -> Played -> Advanced -> Retired
```

### Immutable Identity

Schedule Item should include a stable generated item ID or source item reference sufficient for diagnostics and player hot-reload behavior.

### Mutable Properties

Schedule Items should be treated as immutable once generated.

Properties may include:

- item ID;
- source Media reference;
- media type;
- file reference;
- duration;
- duration mode;
- source Playlist item metadata;
- display metadata.

### Relationships

Schedule Item references Media and may include source lineage:

```text
Campaign -> Program -> Playlist -> Playlist Item -> Media -> Schedule Item
```

Lineage is useful for diagnostics but must not cause the Player to evaluate business logic.

### Validation Responsibilities

Schedule Item validation must confirm:

- media type is supported by Player;
- file reference is safe;
- duration semantics are valid;
- video clip mode is explicit when applicable;
- missing media can be handled safely.

### API Implications

Schedule Items must be clear enough for Agent cache synchronization and Player playback.

### Scheduler Implications

Schedule Items are generated by expanding the selected Program into ordered Playlists and ordered Playlist Items.

---

## 11. Player Layer Entities And States

## 11.1 Offline Cache

### Purpose

Offline Cache stores the local resolved schedule and media required for playback.

It guarantees local-first playback.

### Owner

Player Layer.

### Lifecycle

```text
Empty -> Downloading -> Validating -> Ready -> Active -> Stale -> Cleanup Eligible
```

### Immutable Identity

Cached files may be identified locally by safe file references and source Media IDs. Cache entries should preserve source identity when possible.

### Mutable Properties

Typical mutable properties:

- local file path;
- source media ID;
- file size;
- sync status;
- validation status;
- last downloaded time;
- last used time;
- error state.

### Relationships

Offline Cache references:

- Resolved Schedule;
- Schedule Items;
- Media files;
- Theme region Media dependencies.

### Validation Responsibilities

Cache validation must confirm required local files exist before activating new playback where possible.

Cleanup must never remove media referenced by current or pending schedules.

### API Implications

Cache state may be reported for monitoring. It must not be edited as a normal content-management object.

### Scheduler Implications

Cache state may inform monitoring and warnings. It must not decide business scheduling.

---

## 11.2 Playback State

### Purpose

Playback State describes what the Player is currently doing locally.

### Owner

Player Layer.

### Lifecycle

```text
Starting -> Waiting For Schedule -> Playing -> Empty Playlist -> Media Unavailable -> Error -> Recovering
```

### Immutable Identity

Playback State does not require persistent identity. Runtime sessions may have session IDs for diagnostics.

### Mutable Properties

Typical mutable properties:

- current Schedule signature;
- current Schedule Item ID;
- current Program/Playlist lineage if included in resolved output;
- play state;
- playback session key;
- current media type;
- error counters;
- last error.

### Relationships

Playback State consumes the active Resolved Schedule and local cache.

### Validation Responsibilities

Player validation must confirm that current schedule and current media can be rendered safely. If not, it must show a safe state rather than black or stale content.

### API Implications

Playback State may be reported by heartbeat/status APIs. It must not be used as a source of scheduling truth.

### Scheduler Implications

Playback State does not influence schedule resolution except as future monitoring or diagnostics input.

---

## 11.3 Synchronization State

### Purpose

Synchronization State describes whether the Player has the latest valid Resolved Schedule and required media.

### Owner

Player Layer.

### Lifecycle

```text
Pending -> Downloading -> Up To Date -> Out Of Sync -> Offline -> Synchronization Failed -> Unknown
```

### Immutable Identity

Synchronization State does not require persistent identity. Sync attempts may have event IDs for diagnostics.

### Mutable Properties

Typical mutable properties:

- last successful sync time;
- current schedule version or signature;
- fetched schedule version or signature;
- pending downloads;
- failed downloads;
- status;
- last error.

### Relationships

Synchronization State relates:

- local cache;
- server schedule endpoint;
- required media files;
- player heartbeat/status.

### Validation Responsibilities

Synchronization validation must distinguish:

- failed fetch, keep current playback;
- valid empty schedule, overwrite local schedule and show empty state;
- invalid schedule, reject activation and preserve last valid schedule where possible.

### API Implications

Synchronization State should be visible in monitoring and diagnostics.

### Scheduler Implications

Synchronization State must not change Resolver output.

---

## 12. Complete Relationship Graph

```text
Media
  referenced by Playlist Item
  referenced by Theme Region
  included in Schedule Item after resolution
  cached by Offline Cache

Playlist
  contains Playlist Items
  referenced by Program

Program
  contains ordered Playlist references
  referenced by Campaign
  referenced by Assignment
  expanded by Scheduler Resolver

Theme
  contains Theme Regions
  referenced by Campaign or runtime context
  attached to Resolved Schedule
  rendered by Player

Campaign
  references Program
  references Theme
  expresses target and schedule intent
  may produce or inform Assignments during bridge phases
  may produce Scheduler Candidates in future phases

Screen
  belongs to Screen Groups
  future: belongs to Installation and Location
  provides context for Scheduler Resolver

Screen Group
  contains Screens
  may be targeted by Assignment or Campaign intent

Assignment
  binds Program to deployment target
  produces Scheduler Candidate when valid

Scheduler Resolver
  loads Screen context
  evaluates Candidates
  selects one winner
  produces Resolved Schedule

Resolved Schedule
  contains Schedule Items
  includes Theme metadata
  is synchronized to Player

Schedule Item
  references playable Media
  is consumed by Player

Offline Cache
  stores Resolved Schedule and Media locally

Playback State
  reports local playback status

Synchronization State
  reports local schedule and media sync health
```

Correct flow:

```text
Media -> Playlist -> Program -> Campaign
Campaign + Assignment + Screen Context + Time
-> Scheduler Resolver
-> Resolved Schedule
-> Offline Cache
-> Player Playback
```

Incorrect flows:

```text
Campaign -> Player
Screen Group -> Player
Dashboard -> Player scheduling logic
Player -> Campaign
Runtime -> Business mutation
```

---

## 13. Ownership Rules

### 13.1 Business Ownership

Business Layer owns:

- Media;
- Playlist;
- Program;
- Theme;
- Campaign.

Business Layer does not own:

- current playback;
- cache state;
- heartbeat;
- resolver trace;
- synchronization status.

### 13.2 Deployment Ownership

Deployment Layer owns:

- Screen;
- Screen Group;
- future Installation;
- future Location.

Deployment Layer does not own:

- Program content;
- Campaign lifecycle;
- final schedule decisions;
- player cache.

### 13.3 Runtime Ownership

Runtime Layer owns:

- Assignment;
- Candidate generation;
- Scheduler Resolver decision;
- Resolved Schedule;
- Schedule Item generation.

Runtime Layer must not modify Business or Deployment source objects during resolution.

### 13.4 Player Ownership

Player Layer owns:

- local cache state;
- playback state;
- synchronization state;
- local error/recovery state.

Player Layer must not own:

- Campaign logic;
- Assignment logic;
- priority logic;
- group membership logic;
- scheduling logic.

---

## 14. Identity Rules

### 14.1 Stable IDs

Every persisted entity must use stable IDs.

Required stable identifiers:

- `mediaId`
- `playlistId`
- `playlistItemId`
- `programId`
- `programItemId`
- `themeId`
- `themeRegionId`
- `campaignId`
- `screenId`
- `screenGroupId`
- `assignmentId`
- future `installationId`
- future `locationId`

### 14.2 UUID Compatibility

IDs should be compatible with future UUIDs, even if an early implementation uses simpler string IDs.

Code must not assume:

- numeric IDs;
- sequential IDs;
- sortable IDs;
- human-readable IDs.

### 14.3 Reference Integrity

References must point to immutable IDs, not names.

Display names may change without breaking references.

Deleting or archiving referenced objects must be validated before completion.

### 14.4 Array Indexes Are Not Identity

Array index must never be used as the persistent identity of:

- Playlist Items;
- Program sequence items;
- Theme Regions;
- Schedule Items;
- Scheduler Candidates.

Reordering must preserve identity.

---

## 15. Lifecycle Boundaries

### 15.1 Creation

Creation occurs in the owning layer.

Examples:

- Media, Playlist, Program, Theme: Content Workspace.
- Campaign: Publishing Workspace.
- Screen, Screen Group: Deployment Workspace.
- Assignment: Runtime or advanced administration workflow.
- Resolved Schedule: Scheduler Resolver only.
- Offline Cache entries: Player synchronization only.

### 15.2 Publishing

Publishing validates business intent and prepares it for runtime evaluation.

Publishing must not directly command the Player.

Publishing may create or update runtime input, such as Assignments or future Campaign Candidates, according to the active architecture phase.

### 15.3 Deployment

Deployment describes where playback can happen.

Deployment actions include:

- Screen approval;
- Screen naming;
- group membership;
- future Installation and Location organization.

Deployment does not edit content or final schedule output.

### 15.4 Runtime

Runtime begins when Scheduler Resolver evaluates active inputs for a Screen context.

Runtime output is one Resolved Schedule.

Runtime decisions are explainable through diagnostics and traces.

### 15.5 Retirement

Retirement may mean:

- archive business object;
- disable deployment target;
- disable assignment;
- expire campaign;
- replace resolved schedule;
- cleanup unreferenced cache.

Retirement must preserve history where Product Specification requires auditability.

---

## 16. Validation Boundaries

### 16.1 UI Validation

UI validation provides immediate feedback and prevents obvious invalid input.

It may validate:

- required fields;
- simple formats;
- local draft completeness;
- dangerous action confirmation.

UI validation is not authoritative.

### 16.2 API Validation

API validation protects external contracts.

It must validate:

- input shape;
- supported enum values;
- permissions where applicable;
- ID format;
- request consistency.

API validation must not rely on UI validation having occurred.

### 16.3 Domain Validation

Domain validation protects business and runtime invariants.

It must validate:

- object ownership;
- reference integrity;
- lifecycle transitions;
- publishing blockers;
- safe deletion;
- assignment target validity;
- schedule intent validity.

Domain validation is authoritative.

### 16.4 Runtime Validation

Runtime validation happens during candidate generation and resolution.

It must validate:

- enabled state;
- target match;
- time window activity;
- program availability;
- candidate validity;
- deterministic winner selection.

Runtime validation must not mutate source business objects.

### 16.5 Player Validation

Player validation protects local playback.

It must validate:

- schedule file is readable;
- empty schedule is a valid state;
- referenced local media exists;
- media load failures produce safe recovery;
- failed sync does not discard last valid schedule;
- valid empty sync overwrites stale schedule.

Player validation must not become scheduling logic.

---

## 17. Event Model

Events record what changed or what happened. This contract defines event categories, not storage or transport.

### 17.1 Business Events

Examples:

- Media Imported
- Media Validated
- Playlist Created
- Playlist Updated
- Program Saved
- Theme Saved
- Campaign Created
- Campaign Validated
- Campaign Published
- Campaign Paused
- Campaign Archived
- Campaign Rolled Back

### 17.2 Deployment Events

Examples:

- Screen Discovered
- Screen Approved
- Screen Renamed
- Screen Disabled
- Screen Group Created
- Screen Added To Group
- Screen Removed From Group
- Future Location Assigned

### 17.3 Runtime Events

Examples:

- Assignment Created
- Assignment Enabled
- Assignment Disabled
- Scheduler Resolution Completed
- Candidate Selected
- Candidate Rejected
- Resolved Schedule Generated
- Resolver Error

### 17.4 Player Events

Examples:

- Schedule Sync Started
- Schedule Sync Succeeded
- Schedule Sync Failed
- Media Downloaded
- Media Missing
- Cache Validation Failed
- Playback Started
- Playback Advanced
- Playback Error
- Player Heartbeat Received

### 17.5 Event Requirements

Every event should be able to carry:

- event ID;
- timestamp;
- category;
- actor or source;
- object type;
- object ID;
- action;
- result;
- correlation ID where available;
- metadata.

Events must not become the only source of current state unless a future event-sourcing architecture is explicitly adopted.

---

## 18. Engineering Guidelines

### 18.1 TypeScript Model Mapping

TypeScript models should map to domain entities and value objects.

Recommended guidance:

- Use explicit ID types or branded string aliases where practical.
- Use discriminated unions for entity type, media type, region type, target type, schedule item type, and lifecycle state.
- Separate persisted source entities from derived runtime output.
- Separate draft input models from saved domain models where lifecycle requires it.
- Preserve unknown forward-compatible fields only where the contract allows extension.

TypeScript models must not encode database-specific assumptions such as table names, joins, or ORM decorators as domain requirements.

### 18.2 API Mapping

APIs should expose domain concepts at the correct layer.

Guidance:

- Content APIs expose Media, Playlists, Programs, and Themes.
- Publishing APIs expose Campaigns and lifecycle actions.
- Deployment APIs expose Screens, Screen Groups, and future Locations.
- Runtime APIs expose Assignments only as advanced/runtime resources.
- Player-facing schedule APIs expose only Resolved Schedule.
- Diagnostics APIs expose Resolver trace read-only.

API responses should use stable IDs and explicit type fields.

### 18.3 Future Database Schema Mapping

Future database schemas should map to domain ownership boundaries.

Guidance:

- Business tables/collections should not store player heartbeat state.
- Deployment tables/collections should not store Program content.
- Runtime tables/collections should reference business and deployment IDs.
- Player status/cache state should remain operational data.
- Derived read models may exist but must be rebuildable from authoritative sources.

This document does not require relational, document, event, or graph storage.

### 18.4 Future GraphQL/OpenAPI Mapping

Future API contracts should preserve:

- stable entity IDs;
- explicit enums;
- lifecycle states;
- target type discrimination;
- schedule output separation;
- diagnostics read-only boundaries.

GraphQL or OpenAPI contracts must not flatten runtime internals into normal business workflows.

---

## 19. Out Of Scope

This document does not define:

- implementation code;
- database schema;
- SQL;
- ORM models;
- REST implementation;
- GraphQL implementation;
- authentication implementation;
- migration scripts;
- storage engine;
- queue implementation;
- UI component design;
- player rendering code.

Those belong in future implementation contracts or implementation tasks.

---

## 20. Contract Summary

The Narrowcasting domain model is layered:

```text
Business intent
-> Deployment context
-> Runtime resolution
-> Player playback
```

The core rule is:

```text
Business objects express intent.
Deployment objects describe targets.
Runtime objects resolve one schedule.
Player objects play locally.
```

No implementation may violate these boundaries without an explicit Architecture and Product Specification update.

---

## Document Navigation

- **Previous:** [`../product/16_IMPLEMENTATION_GUIDELINES.md`](../product/16_IMPLEMENTATION_GUIDELINES.md)
- **Next:** [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md)
- **Related specifications:** [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md), [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
