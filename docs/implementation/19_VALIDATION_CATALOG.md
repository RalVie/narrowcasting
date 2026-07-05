# Narrowcasting Validation Catalog

- **Document ID:** IMPLEMENTATION-019
- **Version:** 1.0 (Draft)
- **Status:** Engineering Contract
- **Layer:** Implementation Contracts

---

## 1. Purpose

This document defines the canonical validation catalog for the Narrowcasting platform.

It defines validation responsibilities, rule classification, reusable rule format, entity validation categories, publishing validation, Scheduler Resolver validation, Player validation, error handling, UX expectations, and future compatibility.

This document is technology-independent. It does not implement validation code or select validator libraries.

## 2. Role Of The Validation Catalog

The Validation Catalog is the single engineering reference for validation rules and validation ownership.

It exists to prevent validation drift between:

- UI forms;
- API handlers;
- domain services;
- Scheduler Resolver candidate generation;
- Player synchronization and playback;
- future database constraints;
- future OpenAPI or GraphQL contracts;
- automated tests.

Validation may happen in multiple places, but the authoritative rule and ownership must remain clear.

## 3. Relationship To Architecture

This document must remain consistent with:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)

Architecture defines these validation boundaries:

- Playback is always local.
- Media must be cached locally before playback.
- Scheduler Resolver is the runtime authority.
- Player consumes only Resolved Schedules.
- Player must not repeat business or scheduling logic.
- Diagnostics explain runtime behaviour but do not change it.

## 4. Relationship To Product Specification

This document must remain consistent with the Product Specification:

- [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
- [`../product/03_UX_FOUNDATIONS.md`](../product/03_UX_FOUNDATIONS.md)
- [`../product/05_CAMPAIGN_LIFECYCLE.md`](../product/05_CAMPAIGN_LIFECYCLE.md)
- [`../product/06_PUBLISHING_SPECIFICATION.md`](../product/06_PUBLISHING_SPECIFICATION.md)
- [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md)
- [`../product/10_ALERTS_AND_INCIDENTS.md`](../product/10_ALERTS_AND_INCIDENTS.md)
- [`../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md`](../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md)

Product documents define operator-facing expectations. This catalog turns those expectations into engineering validation boundaries.

## 5. Relationship To Domain Model

This document extends [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md).

The Domain Model defines entities, ownership, identity, lifecycle, relationships, and validation responsibilities. This catalog defines reusable validation rule categories and concrete example rules for those entities.

## 6. Relationship To API Contracts

This document extends [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md).

The API Contract defines request and response validation expectations. This catalog defines the rule taxonomy, severity model, error shape, and cross-layer validation ownership APIs should expose consistently.

---

## 7. Validation Principles

### 7.1 Single Source Of Truth For Rules

Every validation rule should have one canonical definition.

The same rule may be enforced in multiple layers, but each layer must understand whether it is helping, enforcing, protecting invariants, or protecting playback.

### 7.2 Validate Early, Enforce Authoritatively

Validation should happen as early as possible for user experience.

Authoritative enforcement must happen at the correct boundary:

- UI helps the user.
- API protects the contract.
- Domain protects invariants.
- Runtime protects Scheduler Resolver input.
- Player protects local playback.

### 7.3 UI Helps

UI validation should guide operators before submission.

It may prevent obvious invalid input, but it is not authoritative.

### 7.4 API Enforces Contract Shape

API validation must reject malformed or unsupported requests even when the UI already validated them.

API validation protects public and internal contracts.

### 7.5 Domain Protects Invariants

Domain validation is authoritative for business and ownership rules.

It protects:

- identity;
- reference integrity;
- lifecycle transitions;
- ownership boundaries;
- safe deletion;
- publishing readiness.

### 7.6 Runtime Protects Scheduler Resolver

Runtime validation ensures candidate generation and Scheduler Resolver input are valid.

Invalid runtime input must be rejected, ignored with traceable reason, or converted into a warning according to rule severity.

### 7.7 Scheduler Resolver Explains, Not Repairs

Scheduler Resolver must reject or ignore invalid candidates with explainable reasons.

It must not silently fix invalid domain data.

### 7.8 Player Protects Playback

Player validation protects local playback continuity.

Player validation must not become scheduling logic.

The Player may validate:

- local schedule readability;
- local media presence;
- media load success;
- valid empty schedule;
- cache readiness.

The Player must not evaluate:

- Campaign eligibility;
- Assignment priority;
- Screen Group membership;
- time-window business logic;
- conflict resolution.

---

## 8. Validation Boundaries

## 8.1 UI Validation

Purpose:

- guide users;
- prevent obvious mistakes;
- preserve drafts;
- show inline and form-level errors;
- explain warnings before submission.

Examples:

- required field missing;
- invalid duration format;
- invalid date range visible in form;
- upload file type appears unsupported;
- publish button disabled until required visible fields are complete.

UI validation must not be trusted as the final authority.

## 8.2 API Validation

Purpose:

- protect request contracts;
- reject malformed input;
- enforce supported values;
- enforce authorization and permission checks where applicable;
- normalize safe transport-level concerns.

Examples:

- invalid ID format;
- unknown enum value;
- unsupported media type;
- pagination limit too high;
- missing command body;
- unauthorized action.

API validation should return stable validation errors.

## 8.3 Domain Validation

Purpose:

- protect domain invariants;
- enforce ownership and lifecycle rules;
- enforce reference integrity;
- enforce safe deletion and publishing rules.

Examples:

- Playlist Item references missing Media;
- Program references archived Playlist;
- Campaign cannot move from Draft directly to Live;
- Media cannot be deleted while referenced by active content;
- Screen Group cannot add unapproved Screen if policy requires approval.

Domain validation is authoritative.

## 8.4 Runtime Validation

Purpose:

- validate runtime inputs before Resolver evaluation;
- produce valid Scheduler Candidates only;
- exclude inactive or invalid runtime bindings;
- preserve deterministic resolution.

Examples:

- Assignment disabled;
- Assignment target no longer exists;
- Assignment outside time window;
- Program referenced by Assignment is unavailable;
- candidate priority invalid.

## 8.5 Scheduler Resolver Validation

Purpose:

- reject invalid candidates;
- choose only from valid candidates;
- produce one valid Resolved Schedule;
- produce explainable rejection reasons.

Scheduler Resolver validation does not repair source data and does not mutate business objects.

## 8.6 Player Validation

Purpose:

- protect local playback;
- keep last valid schedule when sync fails;
- activate valid empty schedules;
- skip unavailable media safely;
- show safe error states rather than black/stale playback.

Examples:

- schedule file unreadable;
- schedule `items` missing;
- valid `items: []`;
- local media file missing;
- video fails to load;
- static theme media missing.

---

## 9. Rule Classification

### 9.1 Required Field Rules

Validate that required fields exist and are not empty.

Examples:

- Media requires `mediaId`.
- Playlist requires `playlistId`.
- Campaign requires lifecycle state.
- Assignment requires target type, target ID, and Program reference.

### 9.2 Identity And Reference Integrity Rules

Validate stable IDs and references.

Examples:

- Playlist Item references existing Media.
- Program references existing Playlist.
- Theme Region references existing Media where required.
- Assignment target exists.

### 9.3 Ownership Rules

Validate layer ownership.

Examples:

- Business APIs must not mutate Player cache state.
- Player heartbeat must not update Campaign data.
- Runtime resolution must not mutate source Campaigns.

### 9.4 Lifecycle Rules

Validate lifecycle state existence and allowed lifecycle operations.

Examples:

- Campaign has exactly one lifecycle state.
- Archived Campaign cannot become active without restore flow.
- Disabled Screen cannot be used as active target where policy forbids it.

### 9.5 State Transition Rules

Validate legal movement from one state to another.

Examples:

- Draft Campaign may be validated.
- Ready Campaign may be scheduled.
- Live Campaign may be paused.
- Expired Campaign may be archived or restored as Draft.

### 9.6 Time Window Rules

Validate temporal eligibility.

Examples:

- start date before end date;
- start time before end time when same-day semantics apply;
- day-of-week values are supported;
- assignment is active at resolution time.

### 9.7 Priority Rules

Validate numeric and deterministic priority behaviour.

Examples:

- priority is numeric;
- candidate sorting is deterministic;
- equal priorities have deterministic tie handling;
- future emergency priorities use valid ranges.

### 9.8 Publishing Rules

Validate whether Campaign intent can be published safely.

Examples:

- Program selected;
- Program not invalid;
- targets exist;
- Theme available;
- no blocking validation errors.

### 9.9 Media Readiness Rules

Validate media availability and playback readiness.

Examples:

- Media file exists;
- Media type supported;
- Playlist item duration valid;
- video duration mode valid;
- Player cache has required file before activation where possible.

### 9.10 Offline And Synchronization Rules

Validate local-first behaviour.

Examples:

- failed fetch keeps current schedule;
- valid empty schedule overwrites stale schedule;
- cache cleanup never removes referenced media;
- synchronization failure reports operational state.

### 9.11 Security And Permission Rules

Validate actor permissions and security boundaries.

Examples:

- user can publish Campaign;
- player can retrieve schedule but cannot edit Campaign;
- user can approve Screen;
- privileged action creates audit event.

---

## 10. Validation Rule Format

Every validation rule should use this reusable structure.

```text
Rule ID:
Name:
Layer:
Applies to:
Severity:
Trigger:
Condition:
Failure response:
User-facing message:
Engineering note:
```

### 10.1 Rule ID

Rule IDs must be stable.

Recommended format:

```text
VAL-{ENTITY}-{NUMBER}
```

Examples:

- `VAL-MEDIA-001`
- `VAL-CAMPAIGN-010`
- `VAL-SCHEDULER-003`
- `VAL-PLAYER-004`

### 10.2 Layer

Allowed layer values:

- UI
- API
- Domain
- Runtime
- Scheduler Resolver
- Player

Rules may list multiple enforcement layers, but one layer should be authoritative.

### 10.3 Applies To

Defines the entity, command, DTO, candidate, schedule output, or player state the rule applies to.

### 10.4 Severity

Allowed severity values:

- Info
- Warning
- Blocking Error
- Critical

Guidance:

- Info explains non-blocking facts.
- Warning requires operator attention or confirmation.
- Blocking Error prevents operation completion.
- Critical indicates operational safety or playback risk.

### 10.5 Trigger

Defines when the rule is evaluated.

Examples:

- on field edit;
- on API request;
- on save;
- on publish validation;
- on candidate generation;
- on schedule resolution;
- on player sync;
- on playback.

### 10.6 Condition

Defines the rule in domain terms.

Conditions should avoid implementation-specific libraries or database syntax.

### 10.7 Failure Response

Defines what happens when validation fails.

Examples:

- reject request;
- block publish;
- require confirmation;
- exclude candidate;
- keep last valid schedule;
- show empty state;
- create warning/alert.

### 10.8 User-Facing Message

Defines operator-friendly message intent.

Messages should be:

- clear;
- actionable;
- non-technical unless in diagnostics;
- specific enough to recover.

### 10.9 Engineering Note

Defines engineering guidance without specifying implementation details.

---

## 11. Entity Validation Catalog

This section defines validation categories and representative rules. It is not an exhaustive list of every future rule.

## 11.1 Media

Validation categories:

- identity;
- file type;
- file availability;
- URL validity;
- Browser Automation action validity;
- RSS resolution readiness;
- metadata extraction;
- reference usage;
- deletion/archive safety.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-MEDIA-001 | Media ID Required | API, Domain | Blocking Error | Media must have stable `mediaId`. |
| VAL-MEDIA-002 | Supported Media Type | API, Domain | Blocking Error | Media type must be supported by platform policy. |
| VAL-MEDIA-003 | File Readable | Domain | Blocking Error | Media file must be readable before it becomes Available. |
| VAL-MEDIA-004 | External URL Valid | UI, API, Domain | Blocking Error | Web URL and RSS Feed media must use valid http/https URLs. |
| VAL-MEDIA-005 | Web URL Render Mode Valid | UI, API, Domain | Blocking Error | Web URL render mode must be iframe or browser. |
| VAL-MEDIA-006 | Browser Automation Valid | UI, API, Domain, Agent | Blocking Error | Browser Automation supports bounded WAIT, CLICK and REFRESH actions only. |
| VAL-MEDIA-007 | Safe Deletion | Domain | Blocking Error | Referenced Media cannot be deleted without explicit valid policy. |
| VAL-MEDIA-008 | Cacheable Reference | Runtime, Player | Blocking Error | Uploaded image/video schedule media references must be local-cacheable. Dynamic Web URL and remote RSS images are online-dependent unless later cached by an explicit cache phase. |
| VAL-RSS-001 | RSS Feed Reachability | Publishing, Runtime | Warning | RSS Feed resolution failure must be reported clearly and must not crash publishing or schedule generation. |

## 11.2 Playlist

Validation categories:

- identity;
- item identity;
- item ordering;
- media references;
- item duration;
- video duration mode;
- empty playlist semantics.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-PLAYLIST-001 | Playlist ID Required | API, Domain | Blocking Error | Playlist must have stable `playlistId`. |
| VAL-PLAYLIST-002 | Stable Item IDs | Domain | Blocking Error | Playlist Items must not depend on array index identity. |
| VAL-PLAYLIST-003 | Media Reference Exists | Domain | Blocking Error | Each Playlist Item must reference existing Media. |
| VAL-PLAYLIST-004 | Duration Valid | UI, API, Domain | Blocking Error | Image duration and explicit video clip duration must be positive. |
| VAL-PLAYLIST-005 | Preserve Item Fields | API, Domain | Blocking Error | Save operations must not drop existing item fields unintentionally. |

## 11.3 Program

Validation categories:

- identity;
- playlist references;
- ordering;
- empty program handling;
- archive/reference safety.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-PROGRAM-001 | Program ID Required | API, Domain | Blocking Error | Program must have stable `programId`. |
| VAL-PROGRAM-002 | Playlist Reference Exists | Domain | Blocking Error | Program sequence items must reference existing Playlists. |
| VAL-PROGRAM-003 | Stable Sequence IDs | Domain | Blocking Error | Program sequence identity must survive reorder. |
| VAL-PROGRAM-004 | Empty Program Explicit | Publishing, Domain | Warning or Blocking Error | Empty Program must be intentional and visible before publish. |

## 11.4 Theme

Validation categories:

- identity;
- canvas dimensions;
- region identity;
- region geometry;
- region type;
- media references;
- safe fallback.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-THEME-001 | Theme ID Required | API, Domain | Blocking Error | Theme must have stable `themeId`. |
| VAL-THEME-002 | Valid Canvas | UI, API, Domain | Blocking Error | Canvas dimensions must be positive. |
| VAL-THEME-003 | Stable Region IDs | Domain | Blocking Error | Theme Regions must have stable IDs. |
| VAL-THEME-004 | Region Geometry Valid | UI, API, Domain | Blocking Error | Region x, y, width, and height must be valid in virtual canvas coordinates. |
| VAL-THEME-005 | Media Region Reference Exists | Domain | Blocking Error | Logo/Image region media references must exist and be image media. |

## 11.5 Campaign

Validation categories:

- identity;
- lifecycle state;
- Program reference;
- Theme reference;
- target intent;
- schedule intent;
- priority;
- publishing readiness;
- revision safety.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-CAMPAIGN-001 | Campaign ID Required | API, Domain | Blocking Error | Campaign must have stable `campaignId`. |
| VAL-CAMPAIGN-002 | Valid Lifecycle State | Domain | Blocking Error | Campaign must have exactly one supported lifecycle state. |
| VAL-CAMPAIGN-003 | Program Required For Publish | Domain | Blocking Error | Campaign cannot publish without valid Program. |
| VAL-CAMPAIGN-004 | Targets Required For Publish | Domain | Blocking Error | Campaign cannot publish without valid target intent. |
| VAL-CAMPAIGN-005 | Live Edit Requires Revision | Domain | Blocking Error | Live Campaign must not be mutated directly when revisioning is active. |
| VAL-CAMPAIGN-006 | Schedule Date Range Valid | UI, API, Domain | Blocking Error | Campaign end date must not be before start date, and date boundaries must be valid. |
| VAL-CAMPAIGN-007 | Active Days Required | UI, API, Domain | Blocking Error | Campaign must select at least one day unless Always Active is enabled. |
| VAL-CAMPAIGN-008 | Time Window Valid | UI, API, Domain | Blocking Error | Campaign time window values must use valid `HH:mm` values. |
| VAL-CAMPAIGN-009 | Priority Valid | UI, API, Domain, Runtime | Blocking Error | Campaign priority must be an integer from 0 to 1000. |

## 11.6 Screen

Validation categories:

- identity;
- approval state;
- name;
- group membership;
- operational status separation.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-SCREEN-001 | Screen ID Required | API, Domain | Blocking Error | Screen must have stable `screenId`. |
| VAL-SCREEN-002 | Valid Approval State | Domain | Blocking Error | Screen approval state must be supported. |
| VAL-SCREEN-003 | Approved Before Targeting | Domain | Blocking Error | Unapproved Screen cannot be used as active target where policy requires approval. |
| VAL-SCREEN-004 | Runtime Status Is Not Identity | API, Domain | Blocking Error | Heartbeat/status must not overwrite Screen identity. |

## 11.7 Screen Group

Validation categories:

- identity;
- membership;
- approved Screens;
- stale references;
- delete safety.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-GROUP-001 | Screen Group ID Required | API, Domain | Blocking Error | Screen Group must have stable `screenGroupId`. |
| VAL-GROUP-002 | Member Screen Exists | Domain | Blocking Error | Group membership must reference existing Screens. |
| VAL-GROUP-003 | Delete Does Not Delete Screens | Domain | Blocking Error | Deleting a group must not delete Screens. |
| VAL-GROUP-004 | Stale Member Safe | API, Domain | Warning | Stale Screen membership should not break group APIs. |

## 11.8 Assignment

Validation categories:

- identity;
- target type;
- target reference;
- Program reference;
- enabled state;
- optional time window;
- priority.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-ASSIGN-001 | Assignment ID Required | API, Domain | Blocking Error | Assignment must have stable `assignmentId`. |
| VAL-ASSIGN-002 | Target Exists | Domain, Runtime | Blocking Error | Assignment target must exist. |
| VAL-ASSIGN-003 | Program Exists | Domain, Runtime | Blocking Error | Assignment Program reference must exist. |
| VAL-ASSIGN-004 | Schedule Window Valid | Domain, Runtime | Blocking Error | Optional schedule window must be valid. |
| VAL-ASSIGN-005 | Priority Valid | Domain, Runtime | Blocking Error | Priority must be numeric and deterministic. |

## 11.9 Resolved Schedule

Validation categories:

- generated by Resolver;
- version/signature;
- item array presence;
- valid empty schedule;
- Theme metadata;
- media references.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-SCHEDULE-001 | Produced By Resolver | Runtime | Critical | Resolved Schedule must be produced only by Scheduler Resolver. |
| VAL-SCHEDULE-002 | Items Array Present | Runtime, Player | Blocking Error | Schedule must contain `items`, including valid empty array. |
| VAL-SCHEDULE-003 | Empty Schedule Valid | Runtime, Player | Info | `items: []` is valid and must overwrite stale local schedule. |
| VAL-SCHEDULE-004 | Schedule Signature Present | Runtime, Player | Warning | Schedule should expose version, timestamp, or content signature. |
| VAL-SCHEDULE-005 | Theme Renderable | Runtime, Player | Warning or Blocking Error | Theme metadata must be renderable or safely optional. |

## 11.10 Schedule Item

Validation categories:

- identity;
- media type;
- file reference;
- duration semantics;
- source lineage;
- missing media behaviour.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-ITEM-001 | Item ID Stable | Runtime | Warning | Schedule Item should expose stable identity for diagnostics and hot reload. |
| VAL-ITEM-002 | Supported Item Type | Runtime, Player | Blocking Error | Schedule Item type must be supported by Player. |
| VAL-ITEM-003 | Safe File Reference | Runtime, Player | Blocking Error | File reference must be safe and local-cacheable. |
| VAL-ITEM-004 | Video Duration Mode Valid | Runtime, Player | Blocking Error | Video duration mode must distinguish full playback from explicit clip. |
| VAL-ITEM-005 | Missing Media Safe | Player | Warning | Missing media must produce safe placeholder or skip, not black/stale playback. |

## 11.11 Player Status

Validation categories:

- heartbeat shape;
- screen identity;
- playback state values;
- software version;
- stale status;
- diagnostic safety.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-PLAYER-001 | Screen ID Present | API, Player | Blocking Error | Player status must identify the Screen where applicable. |
| VAL-PLAYER-002 | Valid Play State | API, Player | Warning | Play state should use supported values. |
| VAL-PLAYER-003 | Heartbeat Timestamp Valid | API | Warning | Heartbeat timestamps must be parseable. |
| VAL-PLAYER-004 | Status Not Scheduling Truth | Domain | Blocking Error | Player status must not determine campaign eligibility. |

## 11.12 Offline Cache

Validation categories:

- local schedule presence;
- media presence;
- cache activation;
- cleanup safety;
- sync failure behaviour.

Example rules:

| Rule ID | Name | Layer | Severity | Summary |
| --- | --- | --- | --- | --- |
| VAL-CACHE-001 | Keep Last Valid On Fetch Failure | Player | Critical | Failed schedule fetch must not erase current playback. |
| VAL-CACHE-002 | Activate Valid Empty Schedule | Player | Blocking Error | Valid empty schedule must replace stale local schedule. |
| VAL-CACHE-003 | Required Media Present | Player | Warning or Blocking Error | Required media should exist before activation where possible. |
| VAL-CACHE-004 | Cleanup Protects References | Player | Critical | Cache cleanup must not delete media referenced by current or pending schedule. |
| VAL-CACHE-005 | Sync Failure Reported | Player, API | Warning | Sync failure must be reported for monitoring. |

---

## 12. Scheduler Resolver Validation

Scheduler Resolver is protected by validated runtime input.

Candidate generation validates source runtime inputs before candidates reach the Resolver.

The Resolver must:

- evaluate valid candidates only;
- reject or ignore invalid candidates;
- explain rejected candidates;
- produce deterministic output;
- produce a valid Resolved Schedule or valid empty/no-assignment state;
- never silently fix invalid domain data;
- never mutate Business or Deployment source objects.

The Resolver must not:

- repair missing Program references;
- rewrite Campaign lifecycle state;
- auto-create missing Media;
- change Screen Group membership;
- let Player state decide business eligibility.

Player never repeats Resolver validation. Player validates only playback readiness for the Resolved Schedule it receives.

Example rejection reasons:

- Disabled;
- Outside date range;
- Outside daily time;
- Wrong weekday;
- Invalid target;
- Missing Program;
- Lower priority;
- Tie resolved deterministically;
- No valid assignment.

---

## 13. Publishing Validation

Publishing validation protects operators before activation.

Publishing validation should produce:

- blocking errors;
- warnings requiring confirmation;
- informational messages;
- impact summary;
- diagnostics links where useful.

## 13.1 Campaign And Program Completeness

Validate:

- Campaign has valid lifecycle state;
- Program selected;
- Program exists;
- Program contains usable Playlist references;
- empty Program is intentional and visible;
- Theme exists where required.

## 13.2 Playlist And Media Readiness

Validate:

- Playlists referenced by Program exist;
- Playlist Items reference existing Media;
- Media type supported;
- media files available;
- item durations valid;
- video duration mode valid;
- static Theme media references available.

## 13.3 Screen And Screen Group Targeting

Validate:

- target type supported;
- target IDs exist;
- Screens approved where policy requires approval;
- Screen Groups contain valid Screens;
- future Installation/Location references valid when implemented.

## 13.4 Assignment Validity

Validate:

- Assignment target exists;
- Program exists;
- enabled state explicit;
- schedule window valid;
- priority valid;
- source metadata safe.

## 13.5 Time Window Correctness

Validate:

- start date/end date formats;
- start date not after end date;
- day-of-week values supported;
- start time/end time formats;
- daily window semantics explicit;
- future time-zone handling does not alter current meaning.

## 13.6 Priority Conflicts

Validate or warn:

- multiple candidates with same priority and same specificity;
- overlapping Campaign intent;
- screen-specific assignment overrides group assignment;
- future emergency priority rules.

Priority conflicts may be warnings before advanced policy exists, but they must be explainable.

## 13.7 Offline Readiness Warnings

Warn when:

- target Screen offline;
- Player sync delayed;
- cache missing required media;
- storage almost full;
- last heartbeat stale;
- schedule not yet synchronized.

Offline warnings do not always block publishing because playback is local-first and players may recover later.

---

## 14. Error Handling

## 14.1 Validation Error Response Shape

Validation error responses should be compatible with the API Problem Details style described in [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md).

Conceptual shape:

```json
{
  "type": "validation-error",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "correlationId": "...",
  "errors": [
    {
      "ruleId": "VAL-CAMPAIGN-003",
      "field": "programId",
      "severity": "blocking_error",
      "message": "Select a valid program before publishing."
    }
  ]
}
```

This shape is conceptual and does not mandate a serialization library.

## 14.2 Field Errors

Field errors apply to one field.

Examples:

- missing name;
- invalid duration;
- unsupported media type;
- invalid date format.

## 14.3 Object Errors

Object errors apply to a whole entity.

Examples:

- Campaign lifecycle transition invalid;
- Program empty;
- Theme has no usable Program Region.

## 14.4 Relationship Errors

Relationship errors apply to references between entities.

Examples:

- Playlist references missing Media;
- Program references archived Playlist;
- Assignment references missing target.

## 14.5 Cross-Entity Errors

Cross-entity errors apply across multiple objects or layers.

Examples:

- Campaign publish would target offline Screens;
- Media deletion would break active Program;
- priority conflict between screen and group assignment.

## 14.6 Warning Versus Blocking Error

Blocking errors prevent the operation.

Warnings allow continuation only when product policy permits confirmation.

Informational messages explain state but do not require action.

Severity must be consistent enough for UI and automated tests to rely on.

---

## 15. Validation And UX

Validation must support operator confidence.

### 15.1 Inline Errors

Inline errors should appear next to the affected field.

They should be concise and actionable.

### 15.2 Form-Level Errors

Form-level errors summarize problems that affect the whole object.

They should link or scroll to affected fields where possible.

### 15.3 Publish Blocking Messages

Publish blocking messages must clearly explain:

- what blocks publishing;
- which object is affected;
- how to fix it;
- whether the issue is error or warning.

### 15.4 Warnings

Warnings must be visible before confirmation.

Examples:

- target Screen offline;
- cache not yet synchronized;
- Campaign overlaps another Campaign;
- storage almost full.

### 15.5 Explainability

Validation must support explainability.

Operators should be able to answer:

- Why can I not save?
- Why can I not publish?
- Why did this candidate not win?
- Why is the Player showing empty state?
- Why was media skipped?

### 15.6 Operator-Friendly Messages

Messages should avoid internal implementation language.

Preferred:

```text
Select a valid program before publishing.
```

Avoid:

```text
programId failed resolver precondition.
```

Diagnostics may expose technical detail behind an explicit advanced view.

---

## 16. Future Compatibility

Validation contracts should remain compatible with:

- TypeScript validators;
- API validation middleware;
- OpenAPI schemas;
- GraphQL schemas;
- database constraints;
- migration tools;
- automated tests;
- generated clients;
- event processors;
- monitoring and alerting systems.

## 16.1 TypeScript Validators

TypeScript validators should map rule IDs and field paths to stable validation errors.

Validator code must not become the only place rules are documented.

## 16.2 API Validation Middleware

Middleware may enforce request shape and transport-level validation.

Domain validation must remain separate from middleware.

## 16.3 OpenAPI Schemas

OpenAPI schemas may describe request/response shapes and basic constraints.

They do not replace domain validation.

## 16.4 Database Constraints

Future database constraints may enforce reference integrity and uniqueness.

They do not replace domain-level validation or operator-friendly errors.

## 16.5 Migration Tools

Migrations should validate existing data against current rules and report remediation steps.

Migration validation must distinguish:

- recoverable warning;
- blocking migration error;
- data requiring manual repair.

## 16.6 Automated Tests

Automated tests should reference validation rule intent and, where useful, stable rule IDs.

Tests should cover:

- valid data;
- invalid data;
- warning cases;
- edge cases;
- lifecycle transitions;
- Scheduler rejection explanations;
- Player offline and cache validation.

---

## 17. Out Of Scope

This document does not define:

- validator implementation;
- validation libraries;
- Zod, Yup, Joi, or similar choices;
- SQL constraints;
- ORM definitions;
- UI component implementation;
- controller code;
- database migrations;
- concrete API endpoint implementation;
- authentication implementation;
- authorization implementation.

Those belong in future implementation tasks or more specific engineering contracts.

---

## 18. Definition Of Done

A validation design is complete only when:

- it maps to the Architecture boundaries;
- it supports Product Specification workflows;
- it respects Domain Model ownership;
- it follows API Contract error and request/response guidance;
- it identifies authoritative validation layer;
- it defines severity;
- it defines trigger;
- it defines failure response;
- it defines operator-facing message intent;
- it avoids implementation-specific libraries or storage details;
- it can be tested.

Before implementation starts, validation designs should be reviewed against:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)
- [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md)
- [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md)
- relevant Product Specification documents.

---

## 19. Contract Summary

The Narrowcasting validation model is layered:

```text
UI helps
API enforces contract
Domain protects invariants
Runtime protects Scheduler Resolver input
Scheduler Resolver selects valid candidates
Player protects local playback
```

The core rule is:

```text
Validate early.
Enforce at the authoritative boundary.
Explain failures.
Never let validation duplicate scheduling logic in the Player.
```

This catalog is the canonical source for validation rule ownership and classification.

---

## Document Navigation

- **Previous:** [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md)
- **Next:** [`20_PERMISSIONS_AND_SECURITY.md`](20_PERMISSIONS_AND_SECURITY.md)
- **Related specifications:** [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md), [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md), [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md)
