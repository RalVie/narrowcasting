PHASE 0

Runnable skeletons.

Separate server, dashboard, player, and agent foundations.

PHASE 1

One server.
One player.
One screen.
One playlist.
Offline playback.
Heartbeat.
Static local schedule sync.

PHASE 2

Local image playback.
Example server media.
Agent media cache sync.
Offline cached image playback.

PHASE 3

Basic media library.
Image upload.
Media metadata JSON.
Dashboard media management.

PHASE 4

Single playlist editor.
Playlist JSON storage.
Schedule generation from playlist.
Offline cached playlist playback.

PHASE 5

Remote dashboard control.
System status endpoints.
Agent status reporting.
Player cache visibility.

PHASE 6

Production appliance mode.
Systemd services.
Chromium kiosk launch.
Boot recovery with cached playback.

PHASE 7

Unified production runtime.
Server-served dashboard.
Single production management URL.
Separate local player runtime.

PHASE 8A

Video media upload support.
Video playlist and schedule items.
Agent video cache sync.
Local player video playback.

PHASE 8B

Optional playlist item scheduling.
Server-side active item filtering.
Dashboard date, day, and time controls.
Player remains schedule-only.

PHASE 8C

Programs between playlists and scheduler.
Scheduler blocks activate programs.
Generated schedule flattens active program playlists.
Legacy default playlist path remains compatible.

PHASE 8D

Theme layout frame foundation.
Default Fullscreen virtual canvas.
Scheduler blocks can select themes.
Player scales themed program region locally.

PHASE 8E.1

Visual theme designer foundation.
Canvas-first editing for the Program Region.
Grid, snap, safe area, center guides, resize handles, and advanced JSON preview.
Player, scheduler, agent, and API remain unchanged.

PHASE 8E.2

Visual region framework.
Themes use a reusable generic `regions[]` editor.
Layers panel selects one region at a time.
Properties panel supports Program Region rename, position, and size.
Program Region duplicate, guarded delete, and alignment tools are available.
Future region types are visible as disabled extension points.
Player still renders only the first Program Region.

PHASE 8E.3

Static asset regions.
Program, Logo, Image, and Text regions are supported.
Logo and Image regions select image media from the Media Library.
Text regions render static styled text.
Player renders theme background, image regions, logo regions, the first Program Region, then text regions.
Agent caches image files referenced by static theme regions through the existing media sync path.

PHASE 8E.4

Clock region.
Clock is the first dynamic non-media region type.
Dashboard previews Clock regions with browser local time.
Player renders Clock regions with local player time and updates them live offline.
Rendering order is background, image regions, program region, logo regions, text regions, then clock regions.
