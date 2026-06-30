# Narrowcasting Permissions And Security

- **Document ID:** IMPLEMENTATION-020
- **Version:** 1.0 (Draft)
- **Status:** Engineering Contract
- **Layer:** Implementation Contracts

---

## 1. Purpose

This document defines the canonical Permissions and Security engineering contract for the Narrowcasting platform.

It defines security principles, trust boundaries, authentication concepts, authorization concepts, role and permission models, ownership rules, Scheduler Resolver protection, API security, Player security, auditing, logging, privacy, and future compatibility.

This document is technology-independent. It does not select identity providers, token formats, encryption algorithms, session mechanisms, firewall rules, or implementation libraries.

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

Architecture defines runtime boundaries and local-first playback.

Product Specification defines roles, permissions, workflows, and operator expectations.

Implementation Contracts define stable engineering agreements that future code must follow.

This document is the implementation contract for permissions, authorization boundaries, and security expectations.

## 3. Relationship To Architecture

This document must remain consistent with:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)

Architecture establishes the following security boundaries:

- Playback is always local.
- Management is optional.
- Player receives only Resolved Schedules and local-cacheable media references.
- Scheduler Resolver remains the runtime authority.
- Player must not calculate schedules.
- Diagnostics explain runtime behaviour but do not change it.

Security controls must preserve these boundaries.

## 4. Relationship To Product Specification

This document must remain consistent with:

- [`../product/08_ROLES_AND_PERMISSIONS.md`](../product/08_ROLES_AND_PERMISSIONS.md)
- [`../product/11_ACTIVITY_LOG_AND_AUDIT.md`](../product/11_ACTIVITY_LOG_AND_AUDIT.md)
- [`../product/07_MONITORING_AND_OPERATIONS.md`](../product/07_MONITORING_AND_OPERATIONS.md)
- [`../product/10_ALERTS_AND_INCIDENTS.md`](../product/10_ALERTS_AND_INCIDENTS.md)
- [`../product/09_OFFLINE_AND_SYNCHRONIZATION.md`](../product/09_OFFLINE_AND_SYNCHRONIZATION.md)

The Product Specification defines user-facing roles and expected behaviour. This document converts those expectations into engineering boundaries.

## 5. Relationship To Domain Model

This document extends [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md).

The Domain Model defines entity ownership and layer boundaries. Security and permissions must follow that ownership.

Examples:

- Business objects are protected by content and publishing permissions.
- Deployment objects are protected by deployment permissions.
- Runtime objects are protected by runtime or administration permissions.
- Player state is protected as operational data.
- Audit data is protected as immutable accountability data.

## 6. Relationship To API Contracts

This document extends [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md).

APIs must enforce authentication and authorization at the server/API boundary. UI permission hiding is helpful but never authoritative.

API contracts must distinguish:

- authenticated identity;
- authorized action;
- visible resource;
- owned resource;
- operational permission;
- administrative permission.

## 7. Relationship To Validation Catalog

This document extends [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md).

Permission and security checks are validation rules at security boundaries.

Security validation must:

- reject unauthorized requests;
- avoid leaking sensitive information;
- produce audit-capable events for privileged actions;
- preserve Scheduler Resolver authority;
- preserve Player local-first safety.

---

## 8. Security Principles

### 8.1 Least Privilege

Users, services, integrations, and devices should receive only the permissions needed for their responsibilities.

Default access should be minimal.

### 8.2 Explicit Authorization

Every protected operation requires explicit authorization.

Authorization must not be inferred from UI visibility, client type, route name, or network location alone.

### 8.3 Separation Of Duties

Different responsibilities should remain separable.

Examples:

- Content editing is separate from publishing.
- Publishing is separate from administration.
- Deployment management is separate from campaign creation.
- Runtime diagnostics are separate from runtime mutation.

### 8.4 Secure By Default

New resources, APIs, roles, and permissions should default to safe behaviour.

If security behaviour is unclear, access should be denied until explicitly allowed.

### 8.5 Defense In Depth

Security controls should exist at multiple layers:

- UI visibility;
- API authorization;
- domain ownership checks;
- runtime validation;
- audit logging;
- operational monitoring.

Failure of one layer must not imply total security failure.

### 8.6 Auditability

Privileged actions must produce audit-capable records.

Audit history must support accountability and investigation.

### 8.7 Explainability

Security and permission failures should be explainable to authorized users.

Messages should help users understand whether an action is unavailable because of:

- missing permission;
- object state;
- lifecycle rule;
- ownership boundary;
- security policy.

### 8.8 Offline Safety

Player playback must remain safe when offline.

Offline Player state must not grant new management authority.

The Player may continue using already synchronized schedules and media, but it must not invent scheduling decisions or bypass future authorization once communication returns.

### 8.9 Zero Trust Between Clients And Server

All clients are untrusted at API boundaries.

This includes:

- Dashboard browser;
- Player;
- Agent;
- future mobile clients;
- future public API clients;
- future integrations.

The server/API layer must validate identity, authorization, and request integrity.

---

## 9. Security Boundaries

## 9.1 Business Layer

Business Layer contains:

- Media;
- Playlists;
- Programs;
- Themes;
- Campaigns.

Security expectations:

- Content permissions protect Media, Playlists, Programs, and Themes.
- Publishing permissions protect Campaign lifecycle operations.
- Runtime status must not mutate business objects.
- Business object deletion/archive must be authorized and auditable.

## 9.2 Deployment Layer

Deployment Layer contains:

- Screens;
- Screen Groups;
- future Installations;
- future Locations.

Security expectations:

- Deployment permissions protect Screen registration, approval, naming, grouping, and future location assignment.
- Player identity must not be equivalent to deployment administration authority.
- Screen operational status must be separated from Screen identity.

## 9.3 Runtime Layer

Runtime Layer contains:

- Assignments;
- Scheduler Resolver;
- Candidates;
- Resolved Schedules;
- diagnostics traces.

Security expectations:

- Runtime mutation must be restricted.
- Diagnostics may be viewable by operators with appropriate permissions.
- Resolver trace must be read-only.
- No client may inject final schedule decisions.

## 9.4 Player Layer

Player Layer contains:

- Offline Cache;
- Playback State;
- Synchronization State;
- heartbeat/status.

Security expectations:

- Player may retrieve its Resolved Schedule.
- Player may report status and heartbeat.
- Player may retrieve media needed for local playback.
- Player must not edit business, deployment, or runtime source objects.

## 9.5 API Layer

API Layer is the enforcement boundary for requests.

Security expectations:

- authenticate caller where authentication is required;
- authorize operation;
- validate input;
- enforce ownership;
- return safe errors;
- produce audit events where required.

## 9.6 Administration

Administration is high-risk.

Security expectations:

- administrative capabilities should be limited to trusted roles;
- configuration changes must be auditable;
- user/role/permission changes must be auditable;
- destructive actions require confirmation and authorization.

## 9.7 Offline Devices

Offline devices are trusted only to continue local playback from previously synchronized valid data.

Offline devices must not be trusted to:

- approve their own identity;
- alter assignments;
- alter campaigns;
- create schedules;
- bypass future revocation once communication resumes.

---

## 10. Authentication

Authentication answers: "Who or what is making this request?"

This document defines concepts only.

It does not choose OAuth, JWT, cookies, sessions, certificates, API keys, SSO, or identity provider technology.

## 10.1 Identity

Identity may represent:

- human user;
- service account;
- Player device;
- monitoring service;
- integration client;
- future API client.

Every authenticated identity should have a stable identity ID.

## 10.2 Sessions

Sessions represent authenticated continuity for interactive users or clients.

Session design must consider:

- expiration;
- revocation;
- device context;
- audit attribution;
- privilege changes;
- inactive sessions.

No session technology is mandated.

## 10.3 Service Identities

Service identities represent non-human platform components.

Examples:

- monitoring service;
- background synchronization service;
- future integration worker;
- future API automation client.

Service identities should have explicit permissions and auditable actions.

## 10.4 Device Identities

Device identities represent Player or Agent devices.

Device identity must be distinct from:

- Screen identity;
- human user identity;
- administrative identity.

A Player device may be associated with a Screen, but this association does not make the device an administrator.

## 10.5 Future SSO Compatibility

The identity model must remain compatible with future enterprise single sign-on.

Future SSO may provide:

- external user identity;
- group membership;
- role mapping;
- session assurance;
- multi-factor signals.

The domain permission model must not depend on one SSO provider.

## 10.6 Future Enterprise Identity Providers

The model should remain compatible with:

- OpenID Connect;
- SAML;
- LDAP;
- Active Directory;
- Azure AD / Entra ID;
- other enterprise identity providers.

These are compatibility targets, not implementation choices.

---

## 11. Authorization

Authorization answers: "Is this identity allowed to perform this action on this resource?"

## 11.1 Authentication Versus Authorization

Authentication identifies the caller.

Authorization decides whether the caller may perform an action.

An authenticated user is not automatically authorized.

## 11.2 Authorization Versus Ownership

Ownership identifies responsibility for an object or layer.

Authorization grants permission to act.

An object owner may have default permissions, but ownership alone should not bypass authorization policy.

## 11.3 Authorization Versus Visibility

Visibility controls what the user can see.

Authorization controls what the user can do.

An entity may be visible but not editable.

Examples:

- Viewer can see Campaigns but not publish them.
- Operator can view Diagnostics but not edit Programs.
- Player can retrieve schedule but cannot inspect Campaign management APIs.

## 11.4 Operational Permissions

Operational permissions support continuity and incident response.

Examples:

- view monitoring;
- acknowledge alerts;
- inspect diagnostics;
- pause/resume Campaign where policy allows;
- view Player status.

Operational permissions do not imply content editing or administration authority.

## 11.5 Authorization Evaluation

Authorization should evaluate:

- identity;
- assigned roles;
- granted permissions;
- resource type;
- resource state;
- ownership context;
- deployment scope;
- future Installation/Location scope;
- action sensitivity.

Authorization results should be deterministic and auditable for privileged actions.

---

## 12. Role Model

Roles are bundles of responsibilities and permissions.

Users may receive one or more roles.

Future custom roles may map to the same permission categories.

## 12.1 System Administrator

Responsible for technical administration of the platform.

Typical responsibilities:

- system configuration;
- users and roles;
- storage;
- updates;
- maintenance mode;
- advanced diagnostics;
- overrides where supported.

This role should be rare.

## 12.2 Organization Administrator

Responsible for organization-level administration.

Typical responsibilities:

- manage users within scope;
- assign roles;
- view audit records;
- manage organizational settings;
- manage future Locations or Installations within scope.

## 12.3 Operator

Responsible for operational continuity.

Typical responsibilities:

- view monitoring;
- investigate diagnostics;
- acknowledge alerts;
- resolve operational incidents;
- pause/resume Campaigns where policy allows.

Operator does not automatically edit content or administer the platform.

## 12.4 Content Editor

Responsible for reusable content assets.

Typical responsibilities:

- upload Media;
- manage Playlists;
- manage Programs;
- edit Themes.

Content Editor does not automatically publish Campaigns.

## 12.5 Publisher

Responsible for publishing content to targets.

Typical responsibilities:

- create Campaigns;
- schedule Campaigns;
- publish Campaigns;
- pause/resume Campaigns;
- archive Campaigns;
- rollback Campaigns where policy allows.

Publisher does not automatically administer devices or users.

## 12.6 Deployment Manager

Responsible for physical and logical deployment structure.

Typical responsibilities:

- register Players;
- approve Screens;
- rename Screens;
- manage Screen Groups;
- future Installation/Location organization;
- deployment diagnostics.

Deployment Manager does not automatically publish Campaigns.

## 12.7 Viewer

Responsible for read-only inspection.

Typical responsibilities:

- view allowed content;
- view allowed deployment state;
- view monitoring dashboards;
- view reports where permitted.

Viewer cannot mutate objects.

## 12.8 Player Device

Represents an authenticated Player runtime device.

Typical responsibilities:

- retrieve Resolved Schedule;
- retrieve required media;
- report heartbeat;
- report playback status;
- report synchronization state.

Player Device cannot mutate business, deployment, or runtime source objects.

## 12.9 Monitoring Service

Represents a service identity used for monitoring or alert ingestion.

Typical responsibilities:

- read operational state;
- write monitoring events where authorized;
- create or update alerts where authorized.

Monitoring Service cannot publish Campaigns unless explicitly granted future automation permissions.

## 12.10 Future API Client

Represents an external integration client.

Typical responsibilities depend on granted scopes.

Future API clients must be permission-scoped and auditable.

---

## 13. Permission Model

Permissions are capabilities grouped by domain responsibility.

Permission names should be stable, explicit, and action-oriented.

## 13.1 Media Management

Example capabilities:

- view Media;
- upload Media;
- edit Media metadata;
- archive Media;
- delete Media;
- view Media usage.

## 13.2 Playlist Management

Example capabilities:

- view Playlists;
- create Playlists;
- edit Playlists;
- reorder Playlist Items;
- delete/archive Playlists;
- view Playlist usage.

## 13.3 Program Management

Example capabilities:

- view Programs;
- create Programs;
- edit Programs;
- reorder Program Playlists;
- delete/archive Programs;
- view Program usage.

## 13.4 Theme Management

Example capabilities:

- view Themes;
- create Themes;
- edit Themes;
- delete/archive Themes;
- view Theme usage.

## 13.5 Campaign Management

Example capabilities:

- view Campaigns;
- create Campaigns;
- edit Draft Campaigns;
- validate Campaigns;
- archive Campaigns;
- duplicate Campaigns;
- rollback Campaigns.

## 13.6 Publishing

Example capabilities:

- publish Campaign;
- pause Campaign;
- resume Campaign;
- schedule Campaign;
- approve Campaign where future approval workflow exists;
- view publish impact;
- confirm publish warnings.

## 13.7 Deployment

Example capabilities:

- register Player;
- approve Screen;
- rename Screen;
- disable Screen;
- delete Screen;
- create Screen Group;
- edit Screen Group;
- manage Screen Group membership;
- future manage Installations;
- future manage Locations.

## 13.8 Assignment Management

Assignments are runtime bindings and should be advanced/admin-oriented.

Example capabilities:

- view Assignments;
- create Assignment;
- update Assignment;
- disable Assignment;
- delete Assignment;
- view Assignment diagnostics.

## 13.9 Monitoring

Example capabilities:

- view monitoring dashboard;
- view Player status;
- view Screen health;
- view synchronization state;
- view storage health;
- acknowledge alerts;
- resolve alerts.

## 13.10 Diagnostics

Example capabilities:

- view Scheduler diagnostics;
- view Resolver trace;
- view raw diagnostic JSON;
- view Activity Log;
- export logs where permitted.

Diagnostics permissions are read-oriented unless a specific operational action is authorized.

## 13.11 Administration

Example capabilities:

- manage users;
- manage roles;
- manage permissions;
- manage storage;
- manage updates;
- manage system settings;
- delete historical data where policy allows.

## 13.12 Configuration

Example capabilities:

- view configuration;
- edit configuration;
- change system defaults;
- configure future integrations;
- configure future identity providers.

## 13.13 Player Registration

Example capabilities:

- register Player;
- approve Player/Screen pairing;
- revoke Player identity;
- reassign Player to Screen;
- view registration history.

## 13.14 Player Diagnostics

Example capabilities:

- view Player heartbeat;
- view playback status;
- view sync status;
- view cache status;
- future request screenshot;
- future request restart.

Operational commands such as restart must be explicitly permissioned when implemented.

## 13.15 System Maintenance

Example capabilities:

- enter maintenance mode;
- perform backup/restore where supported;
- run cleanup tasks;
- perform updates;
- view system version;
- view system health.

---

## 14. Ownership Rules

## 14.1 Business Objects

Business objects are owned by Content and Publishing responsibilities.

Rules:

- Media, Playlists, Programs, and Themes require content permissions to mutate.
- Campaigns require publishing permissions to mutate lifecycle or publish.
- Runtime and Player identities must not mutate business objects directly.

## 14.2 Deployment Objects

Deployment objects are owned by Deployment responsibilities.

Rules:

- Screen registration and approval require deployment permissions.
- Screen Group membership requires deployment permissions.
- Future Location/Installation ownership must support delegated administration.

## 14.3 Runtime Objects

Runtime objects are owned by Runtime/Administration responsibilities.

Rules:

- Assignment mutation requires explicit runtime or administration permission.
- Scheduler diagnostics are read-only unless a future runtime command is explicitly defined.
- Runtime objects must not mutate business objects during resolution.

## 14.4 Player State

Player state is operational data.

Rules:

- Player may report its own state.
- Operators may view Player state with monitoring permission.
- Player state must not be treated as scheduling truth.
- Player state must not authorize business object mutation.

## 14.5 Audit Data

Audit data is accountability data.

Rules:

- audit records are append-only by default;
- audit records must not be edited by normal users;
- audit visibility may be permissioned;
- audit export is privileged;
- audit deletion, if ever allowed, requires strict administrative policy.

---

## 15. Scheduler Resolver Protection

The Scheduler Resolver remains authoritative.

Security requirements:

- Only validated runtime inputs reach the Resolver.
- No client may influence scheduling logic directly.
- Dashboard clients may create business intent or runtime input only through authorized APIs.
- Player never overrides scheduler decisions.
- Player never calculates campaign eligibility.
- Player never applies assignment priority.
- Diagnostics are read-only.
- Resolver traces must not expose sensitive data unnecessarily.

Correct model:

```text
Authorized API
->
Validated Domain/Runtime Input
->
Scheduler Resolver
->
Resolved Schedule
->
Player
```

Forbidden model:

```text
Client
->
Direct schedule decision
->
Player
```

---

## 16. API Security

## 16.1 Protected Resources

Protected resources include:

- Business objects;
- Deployment objects;
- Runtime objects;
- Player status;
- Monitoring data;
- Diagnostics;
- Audit records;
- Administration settings.

Every protected resource must define required permissions for read and mutation.

## 16.2 Permission Evaluation

Permission evaluation should consider:

- identity;
- role;
- permission;
- resource type;
- resource ID;
- action;
- lifecycle state;
- future scope such as Installation or Location.

Permission evaluation must occur server-side.

## 16.3 Administrative Endpoints

Administrative endpoints are high-risk.

Expectations:

- explicit administrator permission;
- audit event;
- safe error messages;
- confirmation for destructive action;
- future support for stronger assurance where required.

## 16.4 Runtime Endpoints

Runtime endpoints protect Assignments, Scheduler diagnostics, and Resolved Schedules.

Expectations:

- Assignment mutation is privileged.
- Scheduler diagnostics are read-only.
- Resolved Schedule retrieval is limited to authorized Player or diagnostic context.
- Runtime APIs must not expose mutation paths that bypass domain validation.

## 16.5 Player Endpoints

Player endpoints support device operation.

Expectations:

- Player identity is authenticated where security model is active.
- Player may retrieve its own schedule.
- Player may retrieve required media.
- Player may report heartbeat and status.
- Player may not access unrelated Screen schedules unless explicitly authorized.
- Player may not edit Campaigns, Programs, Assignments, or Screens.

## 16.6 Future Public APIs

Future public APIs must define:

- authentication;
- scopes;
- rate limits;
- versioning;
- auditability;
- deprecation policy;
- tenant or organization boundaries if multi-tenant support is added.

Public APIs must not expose internal runtime shortcuts.

---

## 17. Player Security

## 17.1 Player Identity

Player identity represents the runtime device or player instance.

It must be distinct from:

- Screen ID;
- human user;
- administrator;
- service account.

Player identity may be associated with a Screen after registration and approval.

## 17.2 Schedule Retrieval

Schedule retrieval must return only the Resolved Schedule for the authorized Player/Screen context.

Players must not retrieve raw Campaigns, Assignments, priorities, or Screen Group rules for local evaluation.

## 17.3 Heartbeat Integrity

Heartbeat data is operational status.

Security expectations:

- heartbeat should be associated with a known Player/Screen identity;
- heartbeat should not mutate business objects;
- stale or suspicious heartbeat should be visible to monitoring;
- heartbeat timestamps should be treated carefully because device clocks may drift.

## 17.4 Status Reporting

Player status may include:

- software version;
- playback state;
- current media;
- sync state;
- cache state;
- disk/memory information where available.

Status reports must avoid unnecessary sensitive data.

## 17.5 Offline Trust Model

Offline Player behaviour is trusted only for continuity of already synchronized content.

When offline, Player may:

- continue current cached playback;
- use local schedule;
- use local media;
- report status later when reconnected.

When offline, Player must not:

- create new schedule decisions;
- approve itself;
- elevate permissions;
- mutate server-side state.

## 17.6 Local Cache Protection

Local cache should be treated as operational data necessary for playback.

Security expectations:

- cache should not expose unnecessary management data;
- cache should contain Resolved Schedule and required media, not raw Campaign/Assignment logic;
- future cleanup must preserve referenced media;
- future tamper detection may validate cache integrity.

## 17.7 Future Certificate Support

Future Player authentication may use certificates or device credentials.

This document does not require a certificate model, but the identity model should remain compatible with:

- device enrollment;
- credential rotation;
- revocation;
- re-pairing;
- replacement hardware.

---

## 18. Auditing

Audit records answer:

```text
Who did what, when, where, why, and what changed?
```

## 18.1 Who

Audit should identify the actor:

- user;
- service account;
- Player device;
- integration client;
- system process.

## 18.2 What

Audit should identify:

- action;
- resource type;
- resource ID;
- resource name where safe;
- result.

## 18.3 When

Audit should include timestamp.

Timestamp source should be server-authoritative where possible.

## 18.4 Where

Audit may include:

- client type;
- IP or network metadata where appropriate;
- device identity;
- future Installation/Location scope.

## 18.5 Before And After

For privileged mutations, audit may include before/after summaries.

Sensitive values must be redacted.

## 18.6 Reason

High-risk operations should support an optional or required reason.

Examples:

- publish with warnings;
- rollback;
- delete/archive;
- override;
- maintenance mode;
- permission change.

## 18.7 Correlation Identifiers

Audit and operational logs should support correlation IDs.

Correlation IDs allow linking:

- API request;
- validation result;
- domain event;
- scheduler resolution;
- player synchronization;
- alert.

## 18.8 Immutable Audit History

Audit history should be append-only and tamper-resistant by policy.

Normal application workflows must not edit audit records.

Future retention policies must preserve compliance requirements.

---

## 19. Logging

## 19.1 Operational Logging

Operational logs support troubleshooting.

Examples:

- server start;
- synchronization failure;
- media download failure;
- player heartbeat received;
- resolver error;
- cache warning.

Operational logs are not a substitute for audit records.

## 19.2 Audit Logging

Audit logging supports accountability.

Audit logs should record privileged and security-relevant actions.

Audit logs must be more stable and protected than general operational logs.

## 19.3 Diagnostics

Diagnostics explain system behaviour.

Security expectations:

- diagnostics remain read-only;
- sensitive data is minimized;
- raw JSON is advanced-only;
- resolver traces do not expose secrets.

## 19.4 Privacy Considerations

Logs should avoid unnecessary personal data.

Sensitive fields should be redacted.

Retention should match the purpose of the log.

---

## 20. Privacy

## 20.1 Personal Data

Personal data should be minimized.

Examples may include:

- user name;
- email;
- role assignments;
- audit actor identity;
- optional notes or reasons.

Collect only what is needed for product operation, accountability, and support.

## 20.2 Operational Data

Operational data includes:

- player status;
- screen status;
- synchronization state;
- alerts;
- diagnostics;
- logs.

Operational data should be retained according to operational need.

## 20.3 Device Data

Device data may include:

- hostname;
- IP address;
- software version;
- disk/memory status;
- resolution;
- orientation;
- heartbeat timestamps.

Device data is operational and should not be treated as user content.

## 20.4 Retention

Retention policies should distinguish:

- audit history;
- activity logs;
- operational logs;
- diagnostics;
- player heartbeat history;
- media/content data.

Audit data may require longer retention than operational logs.

## 20.5 Minimization

APIs, logs, diagnostics, and exports should expose only the data needed for the task.

Public or integration APIs should be stricter than internal APIs.

---

## 21. Future Compatibility

## 21.1 RBAC

The model must remain compatible with Role-Based Access Control.

Roles grant permissions.

Users may have multiple roles.

Future custom roles should reuse permission categories.

## 21.2 ABAC

The model should remain compatible with Attribute-Based Access Control.

Future authorization may evaluate:

- Installation;
- Location;
- region;
- ownership;
- campaign state;
- time;
- device trust;
- approval state.

ABAC must extend, not replace, clear permission categories.

## 21.3 Enterprise Identity

The model should remain compatible with enterprise identity providers and directory synchronization.

External group membership may map to roles or permissions.

## 21.4 SSO

Future SSO must integrate with the identity model without changing domain ownership.

SSO authenticates identity. It does not define Narrowcasting domain permissions by itself.

## 21.5 External API Clients

External API clients must be identity-bearing principals with explicit permissions or scopes.

External clients must be auditable.

## 21.6 Multi-Tenant Deployments

Multi-tenant support is not implemented now.

The security model should avoid assumptions that prevent future tenant isolation.

Future multi-tenant support will require explicit tenant boundaries for:

- identity;
- resources;
- permissions;
- audit records;
- integrations;
- Player devices.

---

## 22. Out Of Scope

This document does not define:

- OAuth implementation;
- JWT;
- cookies;
- session storage;
- encryption algorithms;
- TLS configuration;
- certificate implementation;
- identity provider selection;
- firewall configuration;
- network segmentation;
- password policy implementation;
- MFA implementation;
- implementation code;
- database schema;
- ORM models;
- UI component implementation.

Those belong in future implementation tasks or more specific engineering contracts.

---

## 23. Definition Of Done

A permissions or security design is complete only when:

- it respects Architecture boundaries;
- it supports Product Specification roles and workflows;
- it maps to Domain Model ownership;
- it follows API Contract authorization expectations;
- it uses Validation Catalog security rule categories;
- it defines identity type;
- it defines authorization requirements;
- it defines audit expectations;
- it preserves Scheduler Resolver authority;
- it preserves Player local-first safety;
- it avoids technology-specific implementation decisions unless a future contract explicitly requires them.

Before implementation starts, security designs should be reviewed against:

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)
- [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md)
- [`../product/08_ROLES_AND_PERMISSIONS.md`](../product/08_ROLES_AND_PERMISSIONS.md)
- [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md)
- [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md)
- [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md)

---

## 24. Contract Summary

The Narrowcasting security model is layered:

```text
Identity
->
Authorization
->
Domain ownership
->
Runtime protection
->
Auditability
```

The core rule is:

```text
Authenticate identity.
Authorize every protected action.
Respect ownership boundaries.
Protect Scheduler Resolver authority.
Keep Player playback local and constrained.
Audit privileged changes.
```

This contract is the canonical source for permission and security engineering decisions until a more specific security implementation contract is authored.

---

## Document Navigation

- **Previous:** [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md)
- **Next:** [`21_PLAYER_PROTOCOL.md`](21_PLAYER_PROTOCOL.md)
- **Related specifications:** [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md), [`../architecture/SCHEDULING_ARCHITECTURE.md`](../architecture/SCHEDULING_ARCHITECTURE.md), [`../product/08_ROLES_AND_PERMISSIONS.md`](../product/08_ROLES_AND_PERMISSIONS.md), [`17_DOMAIN_MODEL.md`](17_DOMAIN_MODEL.md), [`18_API_CONTRACTS.md`](18_API_CONTRACTS.md), [`19_VALIDATION_CATALOG.md`](19_VALIDATION_CATALOG.md)
