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
- render mode:
  - Embedded iframe
  - Browser renderer

RSS Feed media stores:

- feed URL
- display duration per resolved item
- maximum item count
- optional title

RSS fetching and parsing always happens on the server. RSS Feed media is expanded into concrete resolved `rss_item` schedule items before the Player receives the schedule. The Player receives title, summary, link, optional image and published date data, and never fetches RSS feeds directly.

Embedded iframe is the default Web URL render mode. It works only when the remote website allows iframe embedding.

Browser renderer is a Product 1.2 mode for dedicated Player appliances. It uses the local Chromium kiosk, controlled by the Agent through local-only Chromium DevTools Protocol, to temporarily navigate to a Web URL that blocks iframe embedding, then returns to the Player after the configured duration. The external website is still only rendered content; it does not become the scheduler.

Narrowcasting suppresses browser-owned kiosk UI where technically possible. Website-owned cookie consent dialogs, language selectors, or modal overlays remain the responsibility of the website or customer configuration.

Product 1.3 adds optional Browser Automation for Web URL media using Browser renderer mode. Automation is stored as configuration on the Media object and copied into the resolved schedule. The Agent executes Browser Automation in the local Chromium kiosk. Supported actions are:

- WAIT: pause for a configured number of milliseconds.
- CLICK: click a configured CSS selector with an optional timeout.
- REFRESH: refresh the active browser page at a configured interval while the Web URL item remains active.

Persistent Browser Sessions are a Product 1.3 optimization. Consecutive identical Browser Renderer Web URL schedule items reuse the active browser session instead of reloading the same page and rerunning automation. Navigation occurs again only when URL, render mode, or Browser Automation actions change, or when playback leaves Browser Renderer mode.

Automation is generic configuration, not website-specific code. Narrowcasting does not execute operator-provided JavaScript, store passwords, bypass website security, bypass website frame restrictions, or automatically accept cookies.

## 4.2 Dynamic Media Limitations

Current Product 1.3 limitations:

- Embedded iframe depends on the remote website allowing iframe embedding through CSP and X-Frame-Options.
- Browser Renderer is intended for Raspberry Pi or Linux dedicated Player appliance mode with local Chromium kiosk and local-only CDP.
- Browser Renderer requires the Agent and Chromium kiosk to run on the same appliance.
- CDP must remain bound to localhost and must not be exposed on the network.
- Website-owned cookie banners, language selectors, login prompts and modal overlays cannot be generically removed by Narrowcasting.
- Browser Automation supports WAIT, CLICK and REFRESH only.
- CLICK uses CSS selectors and may interact with document, open shadow roots and CDP-accessible frames, but cannot bypass browser or website security boundaries.
- Browser Inspector, site-specific automation policies and managed credential workflows are future work.
- Web URL content is online-only at playback time.
- RSS text content is resolved server-side into the schedule; remote RSS item images are not guaranteed offline in the MVP.

## 4.3 Video Compatibility Guidance

Uploaded videos are rendered by the local Chromium kiosk on the Player appliance. For Raspberry Pi deployments, customer-provided MP4 files should be encoded conservatively:

- MP4 container
- H.264 video
- `yuv420p` pixel format
- AAC audio, or no audio
- `faststart` enabled
- reasonable bitrate and resolution for the target Raspberry Pi and display

If a video causes Chromium to hang during media initialization or never reaches `canplay`, re-encode it before treating the issue as a scheduling or Player runtime defect.

Recommended stabilization command:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -preset medium -crf 23 -maxrate 8000k -bufsize 16000k \
  -vf "scale='min(1920,iw)':-2" \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  output-pi-safe.mp4
```

For silent output:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
  -preset medium -crf 23 -maxrate 8000k -bufsize 16000k \
  -vf "scale='min(1920,iw)':-2" \
  -an \
  -movflags +faststart \
  output-pi-safe.mp4
```

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
