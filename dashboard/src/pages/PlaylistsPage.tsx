import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { MediaItem } from "../mediaTypes";
import type { PlaylistItem, PlaylistRecord } from "../playlistTypes";

const refreshIntervalMs = 10_000;
type MediaFilter = "all" | "image" | "video" | "web_url" | "rss_feed" | "logo" | "background" | "recent" | "favorite";

function createPlaylistItem(media: MediaItem): PlaylistItem {
  return {
    id: `item-${Date.now()}-${media.mediaId}`,
    mediaId: media.mediaId,
    type: media.type,
    file: media.filename,
    duration: media.duration ?? 10,
    durationMode: media.type === "video" ? "auto" : undefined
  };
}

function isMediaReadyForPlaylist(media: MediaItem) {
  return media.type !== "video" || !media.processingStatus || media.processingStatus === "ready";
}

function getMediaPlaybackFile(media: MediaItem) {
  return media.filename;
}

function getPlaylistItemLabel(item: PlaylistItem, media?: MediaItem) {
  return media?.title ?? media?.filename ?? item.file;
}

function isPersistentWebUrlItem(item: PlaylistItem, media?: MediaItem) {
  return item.type === "web_url" && media?.webUrlPlaybackMode === "persistent";
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaMatchesFilter(media: MediaItem, filter: MediaFilter) {
  const name = media.filename.toLowerCase();

  if (filter === "image") {
    return media.type === "image";
  }

  if (filter === "video") {
    return media.type === "video";
  }

  if (filter === "web_url") {
    return media.type === "web_url";
  }

  if (filter === "rss_feed") {
    return media.type === "rss_feed";
  }

  if (filter === "logo") {
    return media.type === "image" && name.includes("logo");
  }

  if (filter === "background") {
    return media.type === "image" && (name.includes("background") || name.includes("bg"));
  }

  return true;
}

export function PlaylistsPage() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("default");
  const [playlist, setPlaylist] = useState<PlaylistRecord>({
    id: "default",
    name: "Default Playlist",
    version: 0,
    updatedAt: "",
    items: []
  });
  const [status, setStatus] = useState("Loading workspace...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [previewingVideoId, setPreviewingVideoId] = useState<string | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const isDirtyRef = useRef(false);
  const selectedPlaylistIdRef = useRef("default");

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function selectPlaylist(playlistRecord: PlaylistRecord) {
    selectedPlaylistIdRef.current = playlistRecord.id;
    setSelectedPlaylistId(playlistRecord.id);
    setPlaylist(playlistRecord);
  }

  async function loadEditorData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      const mediaResponse = await fetch(apiUrl("/api/media")).catch(() => null);

      if (mediaResponse?.ok) {
        setMediaItems((await mediaResponse.json()) as MediaItem[]);
      }

      return;
    }

    setIsBusy(true);

    try {
      const [mediaResult, playlistResult] = await Promise.allSettled([
        fetch(apiUrl("/api/media")),
        fetch(apiUrl("/api/playlists"))
      ]);
      let mediaLoaded = false;

      if (mediaResult.status === "fulfilled" && mediaResult.value.ok) {
        const mediaBody = (await mediaResult.value.json()) as unknown;

        if (Array.isArray(mediaBody)) {
          setMediaItems(mediaBody as MediaItem[]);
          mediaLoaded = true;
        }
      }

      if (playlistResult.status !== "fulfilled") {
        throw new Error("playlist request failed");
      }

      if (!playlistResult.value.ok) {
        throw new Error(`playlist HTTP ${playlistResult.value.status}`);
      }

      const playlistBody = (await playlistResult.value.json()) as unknown;

      if (!Array.isArray(playlistBody)) {
        throw new Error("playlist response was not an array");
      }

      const playlistRecords = playlistBody as PlaylistRecord[];
      const selectedPlaylist =
        playlistRecords.find((item) => item.id === selectedPlaylistIdRef.current) ??
        playlistRecords.find((item) => item.id === "default") ??
        playlistRecords[0];

      setPlaylists(playlistRecords);

      if (selectedPlaylist) {
        selectPlaylist(selectedPlaylist);
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(mediaLoaded ? "Workspace loaded." : "Playlists loaded. Media library unavailable.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load workspace: ${error.message}` : "Unable to load workspace.");
    } finally {
      setIsBusy(false);
    }
  }

  function addMediaItem(media: MediaItem, index = playlist.items.length) {
    if (!isMediaReadyForPlaylist(media)) {
      setStatus(
        media.processingStatus === "failed"
          ? `Cannot add ${media.filename}: video normalization failed.`
          : `Cannot add ${media.filename}: video is still processing.`
      );
      return;
    }

    setPlaylist((currentPlaylist) => {
      const items = [...currentPlaylist.items];
      items.splice(index, 0, createPlaylistItem(media));

      return {
        ...currentPlaylist,
        items
      };
    });
    markDirty();
  }

  function updatePlaylistName(name: string) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      name
    }));
    markDirty();
  }

  function removeItem(id: string) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.filter((item) => item.id !== id)
    }));
    markDirty();
  }

  function reorderItem(fromIndex: number, toIndex: number) {
    setPlaylist((currentPlaylist) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= currentPlaylist.items.length) {
        return currentPlaylist;
      }

      const items = [...currentPlaylist.items];
      const [item] = items.splice(fromIndex, 1);
      items.splice(Math.min(toIndex, items.length), 0, item);

      return {
        ...currentPlaylist,
        items
      };
    });
    markDirty();
  }

  function updateDuration(id: string, duration: number) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) =>
        item.id === id
          ? {
              ...item,
              duration: Math.max(duration, 1),
              durationMode: item.type === "video" ? "clip" : item.durationMode
            }
          : item
      )
    }));
    markDirty();
  }

  function updateVideoDurationMode(id: string, durationMode: "auto" | "clip") {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) =>
        item.id === id && item.type === "video" ? { ...item, durationMode } : item
      )
    }));
    markDirty();
  }

  async function savePlaylist() {
    setIsBusy(true);
    setStatus("Saving playlist...");

    try {
      const endpoint =
        playlist.id === "default"
          ? apiUrl("/api/playlist")
          : apiUrl(`/api/playlists/${encodeURIComponent(playlist.id)}`);
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(playlist)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as PlaylistRecord;
      const savedPlaylist =
        playlist.id === "default"
          ? {
              ...body,
              id: "default",
              name: body.name ?? playlist.name
            }
          : body;
      selectPlaylist(savedPlaylist);
      setPlaylists((currentPlaylists) =>
        currentPlaylists.map((item) => (item.id === savedPlaylist.id ? savedPlaylist : item))
      );
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`Saved ${savedPlaylist.name}.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createPlaylist(name = "New Playlist", items: PlaylistItem[] = []) {
    setIsBusy(true);
    setStatus("Creating playlist...");

    try {
      const response = await fetch(apiUrl("/api/playlists"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, items })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as PlaylistRecord;
      selectPlaylist(body);
      setPlaylists((currentPlaylists) => [...currentPlaylists, body]);
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`${body.name} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function duplicatePlaylist() {
    await createPlaylist(`${playlist.name} Copy`, playlist.items);
  }

  async function deleteSelectedPlaylist() {
    if (playlist.id === "default") {
      setStatus("Default playlist cannot be deleted.");
      return;
    }

    if (!window.confirm(`Delete playlist "${playlist.name}"?`)) {
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${playlist.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/playlists/${encodeURIComponent(playlist.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const nextPlaylists = playlists.filter((item) => item.id !== playlist.id);
      const nextPlaylist = nextPlaylists.find((item) => item.id === "default") ?? nextPlaylists[0];
      setPlaylists(nextPlaylists);

      if (nextPlaylist) {
        selectPlaylist(nextPlaylist);
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`${playlist.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function getMediaById(mediaId: string) {
    return mediaItems.find((media) => media.mediaId === mediaId || media.id === mediaId || media.filename === mediaId);
  }

  function handleMediaDragStart(event: DragEvent<HTMLElement>, media: MediaItem) {
    if (!isMediaReadyForPlaylist(media)) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-media-id", media.mediaId);
  }

  function handlePlaylistItemDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-playlist-index", String(index));
  }

  function handlePlaylistDrop(event: DragEvent<HTMLElement>, index = playlist.items.length) {
    event.preventDefault();
    const mediaId = event.dataTransfer.getData("application/x-media-id");
    const draggedIndex = event.dataTransfer.getData("application/x-playlist-index");

    if (mediaId) {
      const media = getMediaById(mediaId);

      if (media) {
        addMediaItem(media, index);
      }

      return;
    }

    if (draggedIndex) {
      reorderItem(Number(draggedIndex), index);
    }
  }

  function startVideoPreview(mediaId: string) {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }

    previewTimerRef.current = window.setTimeout(() => setPreviewingVideoId(mediaId), 500);
  }

  function stopVideoPreview() {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    setPreviewingVideoId(null);
  }

  useEffect(() => {
    void loadEditorData();
    const timer = window.setInterval(() => {
      void loadEditorData();
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const filteredMedia = useMemo(() => {
    const search = mediaSearch.trim().toLowerCase();
    const media = mediaItems
      .filter((item) => mediaMatchesFilter(item, mediaFilter))
      .filter((item) =>
        search
          ? [item.filename, item.title, item.url]
              .filter((value): value is string => typeof value === "string")
              .some((value) => value.toLowerCase().includes(search))
          : true
      );

    return mediaFilter === "recent" ? media.slice().reverse() : media;
  }, [mediaFilter, mediaItems, mediaSearch]);
  const filteredPlaylists = playlists.filter((item) =>
    playlistSearch.trim() ? item.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()) : true
  );
  const filterButtons: Array<{ label: string; value: MediaFilter; disabled?: boolean }> = [
    { label: "All", value: "all" },
    { label: "Images", value: "image" },
    { label: "Videos", value: "video" },
    { label: "Web", value: "web_url" },
    { label: "RSS", value: "rss_feed" },
    { label: "Logos", value: "logo" },
    { label: "Backgrounds", value: "background" },
    { label: "Recent", value: "recent" },
    { label: "Favorites", value: "favorite", disabled: true }
  ];

  return (
    <section className="page-section operator-section" id="playlists">
      <div className="section-header">
        <div>
          <h2>Playlists</h2>
          <p>Build playlists from media with direct drag and drop.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void loadEditorData({ force: true })} type="button">
            Refresh
          </button>
          <button disabled={isBusy} onClick={() => void savePlaylist()} type="button">
            Save Playlist
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="operator-workspace">
        <section className="operator-panel media-browser" aria-label="Media library">
          <div className="operator-panel-header">
            <h3>Media Library</h3>
            <span>{filteredMedia.length} shown</span>
          </div>
          <input
            aria-label="Search media"
            onChange={(event) => setMediaSearch(event.target.value)}
            placeholder="Search media"
            type="search"
            value={mediaSearch}
          />
          <div className="operator-filter-row">
            {filterButtons.map((button) => (
              <button
                className={mediaFilter === button.value ? "operator-chip active" : "operator-chip"}
                disabled={button.disabled}
                key={button.value}
                onClick={() => setMediaFilter(button.value)}
                type="button"
              >
                {button.label}
              </button>
            ))}
          </div>
          <div className="operator-media-grid">
            {filteredMedia.map((media) => (
              <article
                className={isMediaReadyForPlaylist(media) ? "operator-media-card" : "operator-media-card disabled"}
                draggable={isMediaReadyForPlaylist(media)}
                key={media.mediaId}
                onDragStart={(event) => handleMediaDragStart(event, media)}
                onMouseEnter={() => media.type === "video" && startVideoPreview(media.mediaId)}
                onMouseLeave={stopVideoPreview}
              >
                <div className="operator-thumb">
                  {media.type === "image" ? (
                    <img alt="" src={apiUrl(`/media/${encodeURIComponent(media.filename)}`)} />
                  ) : previewingVideoId === media.mediaId ? (
                    <video autoPlay muted playsInline src={apiUrl(`/media/${encodeURIComponent(getMediaPlaybackFile(media))}`)} />
                  ) : (
                    <div className="operator-video-mark">Play</div>
                  )}
                </div>
                <strong>{media.filename}</strong>
                <span>
                  {media.type} · {formatBytes(media.size)}
                </span>
                {media.type === "video" && !isMediaReadyForPlaylist(media) ? (
                  <span>{media.processingStatus === "failed" ? "Normalization failed" : "Processing video"}</span>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="operator-panel playlist-browser" aria-label="Playlists">
          <div className="operator-panel-header">
            <h3>Playlists</h3>
            <span>{playlists.length}</span>
          </div>
          <input
            aria-label="Search playlists"
            onChange={(event) => setPlaylistSearch(event.target.value)}
            placeholder="Search playlists"
            type="search"
            value={playlistSearch}
          />
          <div className="operator-action-grid">
            <button disabled={isBusy} onClick={() => void createPlaylist()} type="button">
              New Playlist
            </button>
            <button disabled={isBusy} onClick={() => void duplicatePlaylist()} type="button">
              Duplicate
            </button>
            <button disabled={isBusy || playlist.id === "default"} onClick={() => void deleteSelectedPlaylist()} type="button">
              Delete
            </button>
          </div>
          <div className="operator-list">
            {filteredPlaylists.map((item) => (
              <button
                className={item.id === selectedPlaylistId ? "operator-list-item active" : "operator-list-item"}
                key={item.id}
                onClick={() => {
                  selectPlaylist(item);
                  isDirtyRef.current = false;
                  setIsDirty(false);
                }}
                type="button"
              >
                <strong>{item.name}</strong>
                <span>{item.items.length} item(s)</span>
              </button>
            ))}
          </div>
        </section>

        <section
          className="operator-panel playlist-content-panel"
          aria-label="Playlist content"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handlePlaylistDrop(event)}
        >
          <div className="operator-panel-header">
            <div>
              <h3>{playlist.name}</h3>
              <span>Version {playlist.version}</span>
            </div>
            <button disabled={isBusy} onClick={() => void savePlaylist()} type="button">
              Save
            </button>
          </div>
          <input
            aria-label="Playlist name"
            className="operator-title-input"
            onChange={(event) => updatePlaylistName(event.target.value)}
            value={playlist.name}
          />
          <div className="operator-drop-zone">
            Drop media here
          </div>
          <div className="operator-timeline">
            {playlist.items.length === 0 ? <p className="operator-empty">No media yet. Drag media into this playlist.</p> : null}
            {playlist.items.map((item, index) => {
              const media = getMediaById(item.mediaId) ?? getMediaById(item.file);

              return (
                <article
                  className="operator-timeline-row"
                  draggable
                  key={item.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={(event) => handlePlaylistItemDragStart(event, index)}
                  onDrop={(event) => handlePlaylistDrop(event, index)}
                >
                  <span className="operator-drag-handle">Drag</span>
                  <div className="operator-item-main">
                    <strong>{getPlaylistItemLabel(item, media)}</strong>
                    <span>
                      {item.type}
                      {item.type === "video"
                        ? " - video duration from file"
                        : isPersistentWebUrlItem(item, media)
                          ? " - persistent until schedule changes"
                          : ""}
                    </span>
                  </div>
                  {item.type === "video" ? (
                    <fieldset className="operator-duration-options">
                      <legend>Afspeelduur</legend>
                      <label>
                        <input
                          checked={item.durationMode !== "clip"}
                          name={`duration-mode-${item.id}`}
                          onChange={() => updateVideoDurationMode(item.id, "auto")}
                          type="radio"
                        />
                        Volledige video
                      </label>
                      <label>
                        <input
                          checked={item.durationMode === "clip"}
                          name={`duration-mode-${item.id}`}
                          onChange={() => updateVideoDurationMode(item.id, "clip")}
                          type="radio"
                        />
                        Aangepaste duur:
                        <input
                          disabled={item.durationMode !== "clip"}
                          min="1"
                          onChange={(event) => updateDuration(item.id, Number(event.target.value))}
                          type="number"
                          value={item.duration}
                        />
                        seconden
                      </label>
                    </fieldset>
                  ) : isPersistentWebUrlItem(item, media) ? (
                    <p className="operator-empty">Persistent Web URL playback has no playlist duration.</p>
                  ) : (
                    <label>
                      Duration
                      <input
                        min="1"
                        onChange={(event) => updateDuration(item.id, Number(event.target.value))}
                        type="number"
                        value={item.duration}
                      />
                    </label>
                  )}
                  <button disabled={isBusy} onClick={() => removeItem(item.id)} type="button">
                    Remove
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
