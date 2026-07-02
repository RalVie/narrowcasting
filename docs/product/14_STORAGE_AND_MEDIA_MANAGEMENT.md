# Narrowcasting Storage & Media Management Specification

- **Document ID:** PRODUCT-014
- **Version:** 3.0 (Draft)
- **Status:** Design Specification

---

## 1. Purpose

This document defines how media assets, storage, caching and lifecycle management behave throughout the Narrowcasting platform.

Media is the foundation of every campaign.

Storage management must therefore be predictable, safe and transparent.

Operators should never wonder:

```text
Where is my media
->

```

```text
Is it downloaded
->

```

```text
Is it still used
->

```

```text
Can I safely delete it
->

```

## 2. Storage Philosophy

Media SHALL never disappear unexpectedly.

Deletion is always intentional.

Cleanup is always validated.

Storage management prioritizes:

Playback continuity

Data integrity

Storage efficiency

Operator understanding

## 3. Storage Layers

```text
Content Library

->

Publishing

->

Resolved Schedule

->

Player Cache

->

Playback
```

Only the Content Library is user editable.

## 4. Media Lifecycle

Every media object progresses through:

```text
Imported

->

Validated

->

Available

->

Published

->

Cached

->

Referenced

->

Unused

->

Archived

->

Deleted
```

Deletion is always the final step.

## 4.1 Dynamic Media

Product 1.1 adds two dynamic Media types:

- Web URL
- RSS Feed

These are Business Layer Media objects. They can be added to playlists, programs and campaigns like uploaded images and videos.

Web URL media stores:

- URL
- display duration
- optional title

RSS Feed media stores:

- feed URL
- display duration per resolved item
- maximum item count
- optional title

RSS fetching and parsing happens on the server. The Player receives only resolved schedule items and never fetches RSS feeds directly.

Some Web URLs may not render in the Player because the remote website blocks iframe embedding with X-Frame-Options or Content-Security-Policy. This is an external website limitation.

## 5. Media States

A media object can be:

Importing

Available

Referenced

Downloading

Cached

Missing

Corrupt

Archived

Deleted

Only one primary state may exist.

## 6. Usage Tracking

Every media asset exposes:

Used by Playlists

Used by Programs

Used by Campaigns

Referenced by Players

Cache Presence

Last Used

Future Usage

Deletion Risk

Operators always know where media is used.

## 7. Safe Deletion

Before deleting media the platform SHALL determine:

```text
Referenced by Playlist
->

```

```text
Referenced by Program
->

```

```text
Referenced by Campaign
->

```

```text
Referenced by Active Schedule
->

```

```text
Referenced by Player Cache
->

```

If yes:

Deletion SHALL be blocked or require explicit confirmation.

## 8. Archive vs Delete

Archive

Media remains available.

History preserved.

Future restore possible.

Delete

Permanent removal.

Requires dependency validation.

Commercial deployments should prefer Archive.

## 9. Player Cache

Every player maintains its own cache.

The cache contains:

Referenced Media

Future Media

Validation Metadata

Checksums (future)

The cache is implementation detail.

Operators view health, not files.

## 10. Cache Validation

Before cache cleanup:

Determine active schedule.

Determine future schedule.

Determine pending synchronization.

Protect all referenced media.

Cleanup only removes orphaned content.

## 11. Cleanup Rules

Media SHALL NOT be removed if referenced by:

Current playback

Next playback

Resolved Schedule

Pending Schedule

Synchronization Queue

Cleanup is always dependency aware.

## 12. Storage Monitoring

The server monitors:

Library Size

Available Storage

Growth Rate

Archive Size

Deleted Media

Cleanup Queue

Players monitor:

Cache Size

Free Space

Pending Cleanup

Missing Files

## 13. Media Validation

Every imported asset is validated.

Checks include:

Supported format

Readable

Duration

Resolution

Aspect Ratio

File Integrity

Duplicate Detection (future)

Metadata Extraction

## 14. Dependency Graph

Every media object exposes:

```text
Media

->

Playlist

->

Program

->

Campaign

->

Resolved Schedule

->

Players
```

This graph is visible before destructive actions.

## 15. Bulk Operations

Supported operations:

Bulk Import

Bulk Archive

Bulk Delete

Bulk Metadata Update

Bulk Validation

Bulk Rebuild

Bulk Export

## 16. Search & Organization

Media supports:

Folders

Collections

Tags

Search

Filters

Sort

Favorites

Future:

AI Classification

Visual Similarity

Automatic Tagging

## 17. Enterprise Requirements

Support:

Millions of media assets

Multiple operators

Concurrent uploads

Background validation

Incremental indexing

Large storage pools

Remote storage (future)

## 18. Future Extensions

Reserved

Cloud Storage

S3

Azure Blob

NAS

Media Versioning

Content Deduplication

Transcoding

Proxy Files

Thumbnail Generation

Checksum Verification

AI Metadata

## 19. Requirements

**REQ-MEDIA-001**

Every media object SHALL expose dependency information.

**REQ-MEDIA-002**

Deletion SHALL validate dependencies.

**REQ-MEDIA-003**

Cleanup SHALL never remove referenced media.

**REQ-MEDIA-004**

Archive SHALL be preferred over deletion.

**REQ-MEDIA-005**

Media validation SHALL occur automatically.

**REQ-MEDIA-006**

Storage health SHALL be continuously monitored.

**REQ-MEDIA-007**

Player caches SHALL remain autonomous.

**REQ-MEDIA-008**

Media lifecycle SHALL be visible to operators.

## 20. Definition of Done

Storage & Media Management is complete when:

- Operators always know where media is used.

- Cleanup is safe.

- Cache remains healthy.

- Dependency graphs prevent accidental deletion.

- Storage scales to enterprise deployments.

- Playback continuity is never compromised.

## Relationship with Other Specifications

PRODUCT-001

Product Vision

PRODUCT-006

Publishing

PRODUCT-007

Monitoring

PRODUCT-009

Offline & Synchronization

This document defines the complete lifecycle of media assets and storage throughout the platform.

## Architect Notes

This specification intentionally separates Media Management, Publishing, Synchronization and Player Cache into distinct responsibilities.

The Content Library owns the media.

Publishing owns business intent.

Synchronization distributes validated content.

The Player Cache guarantees uninterrupted playback.

This separation ensures that future enhancements such as cloud storage, deduplication, AI tagging, remote repositories or automatic cache optimization can be added without changing the core architecture.

Media should be treated as a long-lived business asset, not simply as files on disk.

---

## Document Navigation

- **Previous:** 13_INSTALLATIONS_AND_LOCATIONS.md
- **Next:** 15_DESIGN_SYSTEM.md
- **Related specifications:** 06_PUBLISHING_SPECIFICATION.md, 09_OFFLINE_AND_SYNCHRONIZATION.md, 07_MONITORING_AND_OPERATIONS.md
