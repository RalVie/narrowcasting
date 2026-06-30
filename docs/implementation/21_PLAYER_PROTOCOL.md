# Narrowcasting Player Protocol

- **Document ID:** IMPLEMENTATION-021
- **Version:** 1.0 (Draft)
- **Status:** Engineering Contract
- **Layer:** Implementation Contracts

---

## 1. Purpose

This document defines the canonical Player Protocol engineering contract for the Narrowcasting platform.

The Player Protocol describes the behaviour, responsibilities, lifecycle, synchronization expectations, diagnostics, error handling, and compatibility rules between the Server Runtime and the Player. It is technology-independent. It does not define HTTP handlers, JSON schemas, WebSocket messages, MQTT topics, serialization formats, database tables, or Player implementation code.

This contract exists to keep the Player deterministic, offline-capable, locally cached, and isolated from scheduling logic while allowing the Server Runtime and Scheduler Resolver to evolve safely.

## 2. Scope

This contract covers:

- Player registration and identity.
- Player configuration retrieval.
- Resolved Schedule synchronization.
- Media synchronization.
- Offline cache behaviour.
- Playback expectations.
- Heartbeat, status, health, diagnostics, and version reporting.
- Error handling and recovery.
- Scheduler Resolver boundaries.
- Security, protocol versioning, and future compatibility.

This contract does not implement the protocol. It defines the stable engineering rules that future APIs, Player runtime code, tests, deployment scripts, and monitoring features must respect.

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

Architecture defines the platform boundaries and runtime authority.

Product Specification defines operator-facing behaviour and workflows.

Implementation Contracts define stable engineering agreements.

This Player Protocol defines the contract between Server Runtime outputs and Player execution.

## 4. Relationship To Architecture

This document must remain consistent with:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)

The following architecture rules are binding:

- Playback is always local.
- Media must be cached locally before playback.
- Management is optional from the Player's perspective.
- The Player must continue playing when the Server, internet, or network is offline.
- The Scheduler Resolver is the single authority for answering: "What should this screen display right now?"
- The Player consumes only a Resolved Schedule and local media references.
- The Player must not evaluate Campaigns, Assignments, priorities, time windows, Screen Groups, or conflict rules.
- Diagnostics may explain behaviour but must not become an alternate scheduling path.

## 5. Relationship To Product Specification

This document must remain consistent with the Product Specification:

- [`../product/00_PRODUCT_INDEX.md`](../product/00_PRODUCT_INDEX.md)
- [`../product/07_MONITORING_AND_OPERATIONS.md`](../product/07_MONITORING_AND_OPERATIONS.md)
- [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md)
- [`../product/10_ALERTS_AND_INCIDENTS.md`](../product/10_ALERTS_AND_INCIDENTS.md)
- [`../product/12_PREVIEW_AND_SIMULATION.md`](../product/12_PREVIEW_AND_SIMULATION.md)
- [`../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md`](../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md)

Product documents describe what operators expect: reliable playback, clear status, offline continuity, publish propagation, operational visibility, and recoverable errors. This contract defines the engineering protocol expectations that make those behaviours possible.

## 6. Relationship To Domain Model

This document extends [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md).

The Domain Model defines Player Layer concepts such as Offline Cache, Playback State, and Synchronization State. This Player Protocol defines how those concepts behave across the Server Runtime to Player boundary.

The Player Protocol does not redefine Business, Deployment, or Runtime entities. It only defines how resolved runtime output is consumed by the Player.

## 7. Relationship To API Contracts

This document extends [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md).

The API Contracts define resource conventions and interface behaviour. This Player Protocol defines the expected semantics behind Player-facing interfaces, including schedule retrieval, media retrieval, heartbeat, status, diagnostics, error reporting, and future protocol evolution.

Transport-specific API shapes remain outside this document.

## 8. Relationship To Validation

This document extends [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md).

Validation responsibilities are divided as follows:

- UI validation helps operators create valid content and publishing intent.
- API validation enforces request and response boundaries.
- Domain validation protects entity invariants.
- Runtime validation protects Scheduler Resolver inputs.
- Scheduler Resolver validation rejects invalid candidates and explains decisions.
- Player validation protects local playback and cache safety.

The Player must validate that received schedules and media are locally usable. It must not repeat business validation or scheduling validation.

## 9. Relationship To Permissions And Security

This document extends [`20_PERMISSIONS_AND_SECURITY.md`](20_PERMISSIONS_AND_SECURITY.md).

The Player Protocol must support:

- Stable Player identity.
- Screen-to-Player trust boundaries.
- Secure configuration retrieval.
- Integrity of schedule and media synchronization.
- Offline trust without granting scheduling authority to the Player.
- Future certificate, token, replay-protection, and device-authentication models.

Security implementation details remain out of scope.

---

## 10. Design Principles

### 10.1 Server Authoritative

The Server Runtime is authoritative for published runtime data, Player registration state, approved Screen identity, media availability, and diagnostic collection.

The Player may cache and execute data locally, but it does not become the source of truth for business or runtime decisions.

### 10.2 Scheduler Resolver Authoritative

The Scheduler Resolver is the only component that determines the Resolved Schedule for a Screen.

The Player must never independently evaluate Campaigns, Assignments, priorities, time windows, Screen Groups, or future override rules.

### 10.3 Player Deterministic

Given the same valid Resolved Schedule and local media cache, the Player should produce predictable playback behaviour.

Runtime differences such as network loss, temporary Server failure, or dashboard unavailability must not change valid local playback output.

### 10.4 Explainable Behaviour

Player behaviour must be observable and explainable through status, heartbeat, diagnostics, errors, warnings, schedule signatures, cache metadata, and playback state.

Operators and developers should be able to determine whether an issue comes from scheduling, synchronization, media availability, local playback, or device health.

### 10.5 Offline-First

The Player must be designed for offline continuity.

The normal playback path uses locally cached schedules and media. Server access is used to update local state, not to stream required playback decisions at display time.

### 10.6 Eventual Consistency

Published changes propagate from Server Runtime to Player through synchronization.

The protocol must tolerate short delays, retries, temporary failures, and partial sync attempts while preserving the last valid local playback state.

### 10.7 Idempotent Synchronization

Repeated synchronization operations must be safe.

Fetching the same configuration, schedule, media file, or metadata multiple times must not corrupt local cache state, duplicate playback items, or reset unrelated local runtime state unnecessarily.

### 10.8 Stable Protocol Evolution

The protocol must support additive evolution.

New optional fields, diagnostics, media types, and future runtime metadata should not break older compatible Players when core playback requirements are still satisfied.

### 10.9 Backward Compatibility

The Server Runtime should preserve compatibility for deployed Players where practical.

Breaking protocol changes require explicit versioning, migration guidance, and safe failure behaviour.

---

## 11. Architectural Responsibilities

### 11.1 Business Layer

The Business Layer owns:

- Media.
- Playlists.
- Programs.
- Themes.
- Campaigns.

Business objects express operator intent. They do not directly command a Player and they do not own Player runtime state.

### 11.2 Deployment Layer

The Deployment Layer owns:

- Screens.
- Screen Groups.
- Future Installations.
- Future Locations.

Deployment objects define where playback can happen. They associate physical or logical display endpoints with operational context. They do not independently decide what content should play.

### 11.3 Runtime Layer

The Runtime Layer owns:

- Assignments.
- Scheduler Candidates.
- Scheduler Resolver decisions.
- Resolved Schedules.
- Runtime diagnostics.

Runtime objects translate business intent and deployment context into executable Player output.

### 11.4 Scheduler Resolver

The Scheduler Resolver:

- Loads Screen context.
- Receives valid runtime candidates.
- Selects the winning candidate.
- Produces exactly one Resolved Schedule for the requested Screen context.
- Exposes explanation and diagnostics.

The Scheduler Resolver must not be bypassed by publishing, dashboard, Player, or future automation workflows.

### 11.5 Publishing

Publishing validates and activates operator intent.

Publishing may create or update runtime inputs such as Assignments or future scheduling rules. Publishing must not push direct playback commands to Players or create an alternate schedule-generation path.

### 11.6 Server Runtime

The Server Runtime:

- Exposes Player-facing protocol resources.
- Serves resolved schedules.
- Serves cacheable media resources.
- Stores registration, status, heartbeat, and diagnostic data.
- Coordinates schedule and media availability.
- Preserves authoritative runtime state.

The Server Runtime does not rely on the Player to evaluate scheduling decisions.

### 11.7 Player

The Player:

- Identifies itself.
- Retrieves configuration.
- Synchronizes Resolved Schedule data.
- Synchronizes required media.
- Validates local readiness.
- Plays from local cache.
- Reports status, heartbeat, errors, warnings, and diagnostics.
- Recovers from transient failures.
- Continues playback offline using the last valid local state.

The Player does not own Campaigns, Assignments, scheduling rules, or operator workflows.

### 11.8 Offline Cache

The Offline Cache stores:

- Last valid Resolved Schedule.
- Required media files.
- Required Theme assets.
- Cache metadata.
- Schedule signatures.
- Synchronization metadata.

The Offline Cache is a local execution cache, not the authoritative source of business or runtime truth.

### 11.9 Diagnostics

Diagnostics expose:

- Player identity and version.
- Registration state.
- Current playback state.
- Current schedule signature.
- Current media item.
- Cache health.
- Synchronization status.
- Heartbeat timing.
- Playback errors and warnings.
- Device health where available.

Diagnostics must be read-only unless a future explicit operator action contract defines otherwise.

---

## 12. Protocol Lifecycle

### 12.1 Player Registration

The conceptual registration lifecycle is:

```text
Unregistered
->
Registering
->
Pending Approval
->
Approved
->
Active
->
Retired
```

Registration binds a Player identity to a Screen context. Approval determines whether the Player is allowed to receive operational runtime output.

### 12.2 Player Identification

Every Player must have a stable identity that survives restarts.

The Player identity must be distinguishable from:

- Screen ID.
- User identity.
- Device hostname.
- Network address.

The Screen may represent an operator-managed display endpoint. The Player identity represents a runtime client instance.

### 12.3 Configuration Retrieval

After registration and approval, the Player retrieves configuration needed to participate in the runtime protocol.

Configuration may include:

- Screen identity.
- Protocol version expectations.
- Polling or heartbeat intervals.
- Cache policies.
- Diagnostic settings.
- Server endpoints or discovery metadata.
- Future capability flags.

Configuration retrieval must be safe to repeat.

### 12.4 Schedule Synchronization

The Player retrieves the Resolved Schedule for its Screen context.

Schedule synchronization must:

- Preserve the last valid local schedule on fetch failure.
- Reject invalid schedule payloads without corrupting the current local schedule.
- Treat a valid empty schedule as a valid runtime state.
- Record schedule version, timestamp, and signature where available.
- Activate changed schedules safely.

### 12.5 Media Synchronization

The Player must synchronize all media required for playback before relying on that media for local display.

Media synchronization must:

- Skip files already present and valid.
- Retry missing or failed files.
- Preserve existing valid files on failed download.
- Avoid deleting cached media unless an explicit cache-pruning contract exists.
- Report missing media clearly.

### 12.6 Playback

Playback uses local schedule and local media.

The Player may use Server access to refresh local state, but active display must not depend on live Server availability.

### 12.7 Status Reporting

The Player reports operational status to the Server Runtime.

Status reporting should include current playback, sync health, cache health, version information, and relevant device health. Unavailable metrics should be represented as unknown or null rather than invented values.

### 12.8 Heartbeat

Heartbeat indicates that the Player runtime is alive.

Heartbeat should be frequent enough to support operator status, offline detection, and future alerting. Missed heartbeat thresholds must be interpreted by the Server Runtime, not by the Player.

### 12.9 Recovery

Recovery covers:

- Server unreachable.
- Schedule fetch failure.
- Invalid schedule payload.
- Media download failure.
- Missing local media.
- Playback error.
- Player restart.
- Power loss.

Recovery should prefer continuing last known valid playback where possible.

### 12.10 Shutdown

Shutdown should preserve local cache and local metadata needed for restart recovery.

Shutdown must not mark content as invalid merely because the Server was unreachable during shutdown.

---

## 13. Player State Machine

The Player state machine is conceptual. Implementations may use different internal state names, but externally observable behaviour must map to these states.

### 13.1 States

| State | Meaning |
| --- | --- |
| Unknown | Player state is not yet known or not reported. |
| Registering | Player is attempting registration or identity binding. |
| Idle | Player is approved but has no active playback work. |
| Synchronizing | Player is retrieving configuration, schedule, media, or metadata. |
| Ready | Player has enough local data to begin playback. |
| Playing | Player is actively displaying scheduled content. |
| Waiting | Player is waiting for assignment, schedule, media, approval, or valid local content. |
| Offline | Player cannot reach the Server but can continue local behaviour where possible. |
| Recovering | Player is recovering from local or remote failure. |
| Error | Player encountered a blocking condition that prevents normal playback. |
| Maintenance | Player is intentionally paused or reserved for maintenance by a future explicit workflow. |

### 13.2 Example Transitions

```text
Unknown -> Registering -> Waiting
Waiting -> Synchronizing -> Ready -> Playing
Playing -> Synchronizing -> Playing
Playing -> Offline -> Playing
Playing -> Recovering -> Playing
Playing -> Error -> Recovering
Waiting -> Playing
Playing -> Waiting
```

### 13.3 State Ownership

The Player owns its current local state report.

The Server Runtime owns the interpretation of fleet status, offline detection, alerting, and historical status records.

---

## 14. Resolved Schedule Contract

### 14.1 Resolved Schedule

A Resolved Schedule is the only scheduling payload the Player consumes.

It represents the Scheduler Resolver's answer for one Screen context at a point in time.

A Resolved Schedule may contain:

- Schedule identity or signature.
- Version.
- Updated timestamp.
- Screen context reference.
- Winning runtime source reference.
- Theme or layout reference.
- Ordered Schedule Items.
- Diagnostic or explainability metadata.
- Future capability metadata.

### 14.2 Schedule Items

Schedule Items are executable playback instructions.

A Schedule Item may describe:

- Stable item ID.
- Media reference.
- Media type.
- Program context.
- Playlist context.
- Duration or playback mode.
- Display metadata.
- Required assets.
- Future playback constraints.

The Player must treat Schedule Items as resolved instructions, not as raw business objects.

### 14.3 Ordering

Schedule Item order is authoritative.

The Player may loop or advance according to the schedule contract, but it must not reorder items based on Campaign, Assignment, Playlist, Program, Group, or priority logic.

### 14.4 Timing

Timing fields are authoritative only when included as resolved playback instructions.

The Player may use local media metadata for playback mechanics, such as video end events, but must not infer business scheduling windows.

### 14.5 Priority

Priority is resolved before the schedule reaches the Player.

The Player must not know or evaluate candidate priority except as optional diagnostic metadata.

### 14.6 Version And Signature

The Resolved Schedule should expose a version, timestamp, signature, or equivalent change indicator.

The Player must be able to detect schedule changes reliably. The signature should represent the full effective playback content, not only a weak timestamp.

### 14.7 Explainability Metadata

Resolved Schedule metadata may include references to a resolution trace or winning candidate for diagnostics.

The Player may report this metadata but must not use it to make scheduling decisions.

### 14.8 Immutable Runtime Decisions

Once a Resolved Schedule is produced, the Player treats it as immutable until a newer valid schedule replaces it.

The Player may maintain local playback position and cycle state, but it must not mutate the schedule definition.

---

## 15. Synchronization

### 15.1 Configuration Synchronization

Configuration synchronization keeps local Player settings aligned with Server Runtime expectations.

Configuration sync must be:

- Idempotent.
- Safe to retry.
- Backward compatible where possible.
- Independent from active playback when configuration is not essential to the current local schedule.

### 15.2 Schedule Synchronization

Schedule synchronization retrieves the latest valid Resolved Schedule.

Rules:

- Failed fetch keeps current local playback.
- Invalid schedule keeps the last valid schedule.
- Valid empty schedule replaces the previous schedule and produces the configured empty state.
- New valid schedule replaces the previous schedule after safe activation checks.
- Schedule writes to local cache must overwrite the prior schedule, not merge with it.

### 15.3 Media Synchronization

Media synchronization retrieves local copies of required files.

Rules:

- Media required for playback should be cached before display.
- Existing valid media may be reused.
- Failed download must not delete an existing valid local file.
- Missing media should produce a visible or reportable playback issue, not an unhandled crash.

### 15.4 Delta Synchronization

Future implementations may support delta synchronization.

Delta sync must preserve the same semantic result as full synchronization. It must not create divergent local schedules, partially merged item lists, or inconsistent media references.

### 15.5 Retry Behaviour

Retries should be bounded, observable, and non-destructive.

Retry failure should degrade to the last valid local state where possible.

### 15.6 Conflict Handling

The Player does not resolve business or runtime conflicts.

Examples:

- Two campaigns targeting one Screen is a Scheduler Resolver concern.
- Screen assignment versus group assignment is a Scheduler Resolver concern.
- Priority ties are a Scheduler Resolver concern.
- Local cache mismatch is a Player synchronization concern.

### 15.7 Offline Operation

When offline, the Player continues with the last valid local schedule and media.

The Player should keep reporting local status when it reconnects, including offline duration and sync recovery information where available.

### 15.8 Recovery

After reconnect, the Player should:

- Retrieve current configuration.
- Retrieve current Resolved Schedule.
- Compare signature or version.
- Synchronize required media.
- Activate the newest valid schedule safely.
- Report recovery status.

### 15.9 Bandwidth Efficiency

The protocol should support efficient behaviour for constrained networks.

Efficiency must not weaken cache correctness, validation, schedule signatures, or offline continuity.

---

## 16. Offline Behaviour

### 16.1 Cached Schedules

The Player must retain the last valid Resolved Schedule.

A cached schedule remains usable while offline unless an explicit expiration policy says otherwise.

### 16.2 Cached Media

The Player must retain media required for local playback.

Media cache pruning is a separate explicit contract and must never be implied by schedule synchronization alone.

### 16.3 Cache Validity

Cache validity may be determined by:

- File presence.
- File size.
- Checksum or signature.
- Media metadata.
- Schedule references.
- Future content-addressed storage metadata.

The Player should prefer verified local media over repeated download when verification is available.

### 16.4 Schedule Expiration

No schedule should expire silently unless the product and implementation contracts define expiration behaviour.

If future expiration is introduced, the Player must expose a clear state such as expired schedule, waiting for valid schedule, or playing within grace period.

### 16.5 Grace Periods

Grace periods must be explicit.

They may be used in future to continue playback briefly after schedule expiration, certificate renewal failure, or Server unavailability. They must not let the Player invent scheduling decisions.

### 16.6 Recovery After Reconnect

Reconnect recovery must not cause flicker, empty playback, or destructive cache resets when a valid local schedule is still playable.

The Player should switch to new content only after the new schedule and required assets are usable.

### 16.7 Publish Propagation

Publishing changes propagate as:

```text
Business change
->
Runtime input update
->
Scheduler Resolver output
->
Resolved Schedule synchronization
->
Media synchronization
->
Local playback activation
```

The Player participates only in the synchronization and playback activation stages.

### 16.8 Failure Behaviour

Failure behaviour must be safe:

- Server unavailable: keep current local playback.
- Network unavailable: keep current local playback.
- Schedule fetch failed: keep current valid schedule.
- Schedule valid but empty: show valid empty state.
- Media missing: skip, placeholder, or report according to playback policy.
- Local cache corrupted: enter recoverable error or waiting state and report diagnostics.

---

## 17. Playback Contract

### 17.1 Player Responsibilities

The Player is responsible for:

- Executing the current valid local schedule.
- Displaying media and regions using local resources.
- Maintaining playback timers and media lifecycle safely.
- Handling image, video, text, clock, and future region types according to their resolved instructions.
- Reporting playback status and errors.
- Recovering from local playback failures where possible.

### 17.2 Timing Guarantees

The Player should honor resolved item timing.

Examples:

- Images use configured display duration.
- Videos with explicit clip duration use that duration.
- Videos without explicit clip duration may advance on native media end.
- Timers and media event handlers must be cleared when items, schedules, or sessions change.

### 17.3 Media Readiness

Media should be locally available before display.

If media is not ready, the Player must not block the entire runtime indefinitely. It should use defined fallback behaviour and report the condition.

### 17.4 Transitions

Transitions between items, schedules, and themes must avoid stale timers, stale media elements, stale source references, and stale event handlers.

The Player should treat schedule changes as a new playback session when necessary to protect correctness.

### 17.5 Fallback Behaviour

Fallback behaviour may include:

- Continue current item until next valid item is ready.
- Skip a failed item.
- Show a media unavailable message.
- Show a playlist empty state.
- Show a no program assigned state.
- Continue last valid offline schedule.

Fallbacks must be visible or diagnosable.

### 17.6 Error Tolerance

The Player should tolerate isolated media errors without crashing the entire runtime.

Repeated failures should produce an operator-visible error state rather than an unexplained black screen.

### 17.7 End-Of-Playback Handling

The Player must define how each media type advances:

- Timed items advance when their resolved duration expires.
- Natural-duration media may advance on native end events.
- Explicit clip durations override natural media length where specified.
- Empty schedules show a clear empty state.

The Player must not use fallback durations to cut off video unless the schedule explicitly indicates that duration is operator-configured for that video item.

---

## 18. Diagnostics

### 18.1 Heartbeat

Heartbeat should communicate that the Player runtime is alive and associated with a known Screen and Player identity.

Heartbeat may include:

- Screen ID.
- Player ID.
- Hostname.
- Software version.
- Uptime.
- Current time.
- Last schedule sync.
- Current schedule signature.
- Current playback state.
- Current media.
- Device metrics where available.

Unavailable metrics should be unknown or null.

### 18.2 Health

Health describes whether the Player is operational.

Conceptual states may include:

- Healthy.
- Warning.
- Offline.
- Error.
- Recovering.
- Waiting.

Server-side fleet health may derive from heartbeat age, sync status, playback status, and errors.

### 18.3 Playback Status

Playback status should identify:

- Active Program context where available.
- Active Playlist context where available.
- Active Schedule Item.
- Media type.
- Play state.
- Timing state.
- Error state.

### 18.4 Current Item

The current item report should use stable references where available.

It should not expose raw internal implementation state as the only diagnostic source.

### 18.5 Errors And Warnings

Errors and warnings should be structured enough to support:

- Operator display.
- Troubleshooting.
- Alerting.
- Future audit or incident correlation.

### 18.6 Performance

Performance diagnostics may include:

- Memory usage.
- CPU usage.
- Disk free.
- Cache size.
- Media load times.
- Schedule sync time.
- Playback recovery count.

Metrics that are unavailable on a platform should be reported as unknown or omitted according to the protocol contract.

### 18.7 Cache Information

Cache diagnostics should expose:

- Cached schedule signature.
- Cached media count.
- Missing media count.
- Failed media count.
- Available disk capacity where possible.
- Last successful sync time.

### 18.8 Version Reporting

The Player should report:

- Player software version.
- Protocol version.
- Capability flags where available.
- Build or release metadata where appropriate.

Version reporting supports staged rollouts, diagnostics, and compatibility decisions.

---

## 19. Error Handling

### 19.1 Protocol Errors

Protocol errors include malformed responses, incompatible versions, missing required fields, unauthorized Player identity, or unsupported required capabilities.

The Player must fail safely and report the condition.

### 19.2 Synchronization Failures

Synchronization failures must not corrupt the last valid local state.

Failed synchronization should produce warnings or errors while preserving playback where possible.

### 19.3 Validation Failures

Validation failures may occur when received runtime data is invalid for Player execution.

The Player must reject invalid local playback data and keep the last valid data where possible.

### 19.4 Expired Schedules

Expired schedule behaviour must be explicit.

Until an expiration contract exists, the Player should not silently stop playback solely because it is offline.

### 19.5 Missing Media

Missing media must be handled safely.

Possible behaviour:

- Continue attempting synchronization.
- Skip the affected item.
- Show a placeholder or media unavailable state.
- Report the missing media.

The Player must not display an unexplained permanent black region.

### 19.6 Recovery Expectations

Recovery should be automatic where possible.

When automatic recovery is not possible, diagnostics must explain the blocking condition and the next operator action.

### 19.7 Operator Visibility

Important Player failures must become visible to operators through status, diagnostics, warnings, alerts, or future incident workflows.

Invisible failure is not acceptable for production signage.

---

## 20. Scheduler Resolver Boundary

The Scheduler Resolver remains the single authority for schedule resolution.

The Player must never:

- Perform scheduling.
- Resolve campaign conflicts.
- Evaluate priorities.
- Evaluate time windows.
- Evaluate days of week.
- Select between Screen and Screen Group assignments.
- Choose a Campaign winner.
- Repair invalid runtime input.
- Generate a Resolved Schedule from raw business objects.

The Player may:

- Execute the received Resolved Schedule.
- Validate local playback readiness.
- Validate cache integrity.
- Report missing or unusable assets.
- Preserve offline playback.
- Report schedule signature and status.

This boundary protects the architecture from duplicated scheduling logic and future inconsistency.

---

## 21. Security Considerations

### 21.1 Player Identity

Player identity must be stable, auditable, and distinct from user identity.

Player identity should survive normal restarts and power loss.

### 21.2 Trust Boundaries

The Player is a trusted runtime endpoint only within the limits of its approved identity and assigned Screen context.

The Player must not be trusted to change business objects, runtime assignments, or scheduling decisions.

### 21.3 Protocol Integrity

The protocol should support integrity protection for schedule, configuration, media metadata, and future command channels.

Implementation choices are out of scope, but the contract must not prevent future integrity checks.

### 21.4 Offline Trust

Offline playback uses previously trusted local data.

Offline trust must be constrained by future expiration, revocation, or certificate rules when those rules are explicitly introduced.

### 21.5 Future Certificate Support

The protocol must be compatible with future device certificates or equivalent identity proof.

Certificate implementation details are out of scope.

### 21.6 Replay Protection Concepts

The protocol should allow future replay protection using timestamps, signatures, nonces, monotonic versions, or equivalent mechanisms.

Replay protection must not break offline playback without an explicit product decision.

---

## 22. Versioning

### 22.1 Protocol Version

The Player Protocol should expose an explicit version or capability model.

Versioning supports compatibility decisions between Server Runtime and deployed Players.

### 22.2 Compatibility

Compatible changes should be additive where possible.

Examples:

- Optional diagnostic fields.
- Optional media metadata.
- Optional capability flags.
- Additional error codes.

### 22.3 Forward Compatibility

Players should ignore unknown optional fields they do not need.

Servers should avoid requiring new fields from older Players without a migration plan.

### 22.4 Graceful Degradation

When a Player lacks a new optional capability, the Server Runtime should degrade safely where product requirements allow.

When a required capability is missing, the failure should be explicit and diagnosable.

### 22.5 Migration Strategy

Protocol migration should define:

- Minimum supported Player version.
- Server compatibility window.
- Required upgrade path.
- Diagnostics for incompatible Players.
- Rollback expectations.

---

## 23. Future Compatibility

The Player Protocol must remain compatible with future:

- Multiple Players per Screen.
- Installations.
- Locations.
- Edge Servers.
- Cloud deployments.
- Streaming media.
- Live content.
- Emergency overlays.
- Remote restart.
- Remote updates.
- Remote screenshots.
- Maintenance mode.
- Protocol extensions.

Future features must preserve the core rules:

- Server Runtime and Scheduler Resolver remain authoritative.
- Player consumes resolved output.
- Playback remains local where required by product architecture.
- Offline cache protects continuity.
- Diagnostics explain behaviour.

---

## 24. Out Of Scope

This contract explicitly excludes:

- HTTP implementation.
- JSON schema.
- WebSocket implementation.
- MQTT implementation.
- Message serialization.
- Compression.
- Encryption algorithms.
- Certificate implementation.
- API endpoint code.
- Player rendering code.
- Cache storage format.
- Database schema.
- ORM definitions.
- Media transcoding implementation.
- Operating system service definitions.

These may be defined by future implementation documents or code, but they must remain consistent with this Player Protocol.

---

## 25. Definition Of Done

The Player Protocol contract is complete when it:

- Is consistent with Architecture.
- Is consistent with Product Specification.
- Is consistent with the Domain Model.
- Is consistent with API Contracts.
- Is consistent with the Validation Catalog.
- Is consistent with Permissions and Security.
- Preserves Scheduler Resolver authority.
- Preserves local-first playback.
- Defines synchronization, offline, playback, heartbeat, diagnostics, error, recovery, and versioning semantics.
- Avoids implementation-specific transport decisions.
- Provides clear future extension points.

---

## 26. Contract Summary

```text
Server Runtime authoritative
->
Scheduler Resolver authoritative
->
Resolved Schedule
->
Player synchronization
->
Offline Cache
->
Local playback
->
Heartbeat and diagnostics
```

The central rule is:

```text
Server resolves.
Player syncs.
Player caches.
Player plays locally.
Player reports status.
Player never schedules.
```

This contract is the canonical source for Player Protocol engineering decisions until a more specific protocol implementation contract is authored.

---

## Document Navigation

- **Previous:** [`20_PERMISSIONS_AND_SECURITY.md`](20_PERMISSIONS_AND_SECURITY.md)
- **Next:** Future `22_ENTERPRISE_SCALE.md`
- **Related specifications:** [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md), [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md), [`../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md`](../product/14_STORAGE_AND_MEDIA_MANAGEMENT.md), [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md), [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md), [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md), [`20_PERMISSIONS_AND_SECURITY.md`](20_PERMISSIONS_AND_SECURITY.md)
