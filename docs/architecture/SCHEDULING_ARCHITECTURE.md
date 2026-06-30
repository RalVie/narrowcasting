# Scheduling Architecture

This document defines the long-term scheduling model for Narrowcasting.

This is a design document only. It does not describe an implemented runtime change yet.

## Core Principle

The Scheduler Resolver must become the single authority that answers:

```text
What should this screen display right now?
```

Everything else is input. The player receives only one resolved schedule.

## Architecture Diagram

```text
Business Layer
Media -> Playlists -> Programs -> Campaigns

Deployment Layer
Screens -> Screen Groups -> Future Tags / Locations

Runtime Rule Layer
Assignments -> Overrides -> Fallbacks

Scheduler Layer
Scheduler Resolver

Player Layer
Resolved Schedule -> Local Cache -> Playback
```

Expanded flow:

```text
Media
  |
Playlists
  |
Programs
  |
Campaigns ----------------+
                          |
Screens / Screen Groups --+
                          |
Assignments --------------+
                          |
Time / Date --------------+
                          |
Future Priorities --------+
Future Emergency Rules ---+
Future Fallbacks ---------+
                          |
                    Scheduler Resolver
                          |
                    Resolved Schedule
                          |
                         Player
```

## Business Layer

The business layer contains the objects operators think in:

- Media
- Playlists
- Programs
- Campaigns

A campaign means:

```text
Publish this program to these targets under these business conditions.
```

Campaigns express operator intent. They do not directly play content and should not become the final scheduling authority.

## Deployment Layer

The deployment layer describes where content can play:

- Screens
- Screen Groups
- Future tags
- Future locations

Screens and groups are target context for the resolver. They should not own final scheduling decisions.

## Runtime Rule Layer

The runtime rule layer contains technical rules used by the resolver:

- Assignments
- Future overrides
- Future fallback rules
- Future maintenance mode
- Future emergency rules

Assignments are runtime target bindings. They should remain mechanical and technical.

## Scheduler Layer

The Scheduler Resolver evaluates all active inputs and produces exactly one resolved schedule.

Inputs may include:

- Screen identity
- Screen group membership
- Campaigns
- Assignments
- Time
- Date
- Future priorities
- Future overrides
- Future emergency messages
- Future fallback content

The Scheduler Resolver is responsible for:

- Matching candidates to a screen
- Filtering inactive candidates
- Resolving conflicts
- Selecting the winning program or fallback
- Expanding program content into schedule items
- Attaching theme/layout information
- Returning one resolved schedule

The scheduler should never expose campaign or assignment internals to the player.

## Player Layer

The player consumes only:

- Resolved schedule JSON
- Local cached media
- Local playback state

The player must not know about:

- Campaigns
- Assignments
- Screen groups
- Priorities
- Time rules
- Conflict resolution

Playback remains local-first.

## Campaigns vs Assignments

Campaigns are the business object.

```text
Campaign = operator intent
```

Assignments are the runtime binding.

```text
Assignment = technical target binding
```

Resolved schedules are the player instruction.

```text
Resolved Schedule = final playback instruction
```

Current bridge model:

```text
Campaign -> Assignment -> Scheduler -> Resolved Schedule -> Player
```

Long-term target model:

```text
Campaigns + Assignments + Screen Context + Time + Priorities
        |
        v
Scheduler Resolver
        |
        v
Resolved Schedule
        |
        v
Player
```

Campaigns may create or maintain assignments during migration, but campaigns should not directly generate final schedules.

## Conflict Resolution Model

Conflict resolution should be explicit and stable.

Recommended ranking dimensions:

```text
1. Emergency level
2. Target specificity
3. Campaign or rule priority
4. Sort order or updatedAt
5. Fallback
```

Target specificity should rank more specific targets above broader targets when priority is otherwise equal:

```text
Screen target
Screen Group target
Default target
```

Emergency rules must outrank normal content, even if the emergency target is broader.

## Future Priority Stack

Recommended future stack:

```text
1. Emergency Override
2. Maintenance / System Lockout
3. Screen-specific Campaign
4. Screen-specific Manual Assignment
5. Group Campaign
6. Group Manual Assignment
7. Default Campaign
8. Default Schedule / Fallback
9. Empty State
```

This stack should eventually be represented by resolver scoring, not scattered conditionals.

Example scoring dimensions:

```text
emergencyLevel
targetSpecificity
priority
updatedAt
sortOrder
```

Within the same layer:

- Higher priority wins.
- If priority ties, explicit sort order should win.
- If no sort order exists, newer `updatedAt` may win.
- Future weighted rotation can rotate between equal matching candidates.

## Suggested APIs

Player/runtime API:

```http
GET /api/schedule?screenId=...
```

Returns only the resolved schedule:

```json
{
  "version": 123,
  "updatedAt": "...",
  "assignmentStatus": "assigned",
  "resolvedSource": {
    "type": "campaign",
    "id": "...",
    "name": "Lunch Menu"
  },
  "theme": {},
  "items": []
}
```

Future dashboard/debug API:

```http
GET /api/scheduler/resolve?screenId=...
```

Returns resolver explanation for operators and diagnostics:

```json
{
  "screenId": "...",
  "matchedCampaigns": [],
  "matchedAssignments": [],
  "rejectedCandidates": [
    {
      "id": "...",
      "reason": "outside time window"
    }
  ],
  "winner": {
    "type": "campaign",
    "id": "..."
  }
}
```

Campaign APIs:

```http
GET /api/campaigns
POST /api/campaigns
POST /api/campaigns/:id/update
POST /api/campaigns/:id/delete
```

Advanced assignment APIs:

```http
GET /api/assignments
POST /api/assignments
POST /api/assignments/:id/update
POST /api/assignments/:id/delete
```

Future override APIs:

```http
POST /api/overrides/emergency
POST /api/overrides/clear
```

## Migration Strategy

### Phase 1: Current Bridge

Current behavior is acceptable as a bridge:

```text
Campaign creates Assignments.
Scheduler resolves Assignments.
Player receives resolved schedule.
```

### Phase 2: Add Declarative Campaign Fields

Campaigns may gain fields such as:

- `startDate`
- `endDate`
- `daysOfWeek`
- `timeWindows`
- `priority`
- `campaignType`
- `weight`
- `rotation`

These fields express intent. The Scheduler Resolver evaluates them.

### Phase 3: Introduce Candidate Model

Normalize all possible inputs into candidates:

```text
Campaign -> Candidate
Assignment -> Candidate
Override -> Candidate
Fallback -> Candidate
```

The resolver filters, scores, and selects the winning candidate.

### Phase 4: Reduce Campaign-Generated Assignment Dependence

Campaign-generated assignments may become an index or compatibility layer rather than the source of truth.

The scheduler should evaluate campaigns and assignments as independent inputs.

### Phase 5: Add Explainability

Add a resolver explanation endpoint so operators can answer:

```text
Why is this screen playing this?
```

This is essential as deployments grow from 10 screens to 100 or 1000 screens.

## Recommended Terminology

Business Layer:

- Media
- Playlist
- Program
- Campaign

Deployment Layer:

- Screen
- Screen Group
- Future Tag
- Future Location

Runtime Layer:

- Assignment
- Candidate
- Override
- Fallback

Scheduler Layer:

- Resolver
- Candidate evaluation
- Conflict resolution
- Resolved Schedule

Player Layer:

- Local schedule
- Local media cache
- Playback state

## Final Recommended Execution Model

Long-term execution should be:

```text
1. Player requests:
   GET /api/schedule?screenId=...

2. Scheduler loads screen context:
   - screen
   - approval state
   - group membership
   - future tags
   - future location

3. Scheduler loads candidate inputs:
   - emergency overrides
   - active campaigns
   - manual assignments
   - group assignments
   - default fallback

4. Scheduler filters candidates:
   - target match
   - enabled
   - date active
   - time active
   - day active
   - valid program/media

5. Scheduler ranks candidates:
   - emergency level
   - target specificity
   - priority
   - sort order / updatedAt
   - fallback

6. Scheduler expands selected program:
   Program -> Playlists -> Media items

7. Scheduler applies theme/layout.

8. Scheduler returns one resolved schedule.

9. Agent syncs the resolved schedule and media locally.

10. Player plays the local schedule offline.
```

Final recommendation:

```text
Campaigns express operator intent.
Assignments provide runtime targeting.
Scheduler evaluates all active inputs.
Player receives one resolved schedule.
```

Do not let campaigns override the scheduler directly. Do not let campaigns generate final schedules directly. The Scheduler Resolver is the long-term authority.
