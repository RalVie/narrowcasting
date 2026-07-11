import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { MediaItem } from "../mediaTypes";
import type { PlaylistItem, PlaylistRecord } from "../playlistTypes";

const refreshIntervalMs = 10_000;
type MediaFilter = "all" | "image" | "video" | "web_url" | "rss_feed";
type ViewMode = "library" | "editor";
type PendingNavigation =
  | {
      type: "back";
    }
  | {
      type: "open";
      playlist: PlaylistRecord;
    };

function createPlaylistItem(media: MediaItem): PlaylistItem {
  return {
    id: `item-${Date.now()}-${media.mediaId}-${Math.random().toString(16).slice(2)}`,
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

function getMediaTitle(media?: MediaItem, fallback?: string) {
  return media?.title ?? media?.filename ?? fallback ?? "Missing media";
}

function getMediaTypeLabel(type: MediaItem["type"] | PlaylistItem["type"]) {
  if (type === "web_url") {
    return "Web Page";
  }

  if (type === "rss_feed") {
    return "RSS Feed";
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

function isPersistentWebUrlItem(item: PlaylistItem, media?: MediaItem) {
  return item.type === "web_url" && media?.webUrlPlaybackMode === "persistent";
}

function getItemDurationSeconds(item: PlaylistItem, media?: MediaItem) {
  if (isPersistentWebUrlItem(item, media)) {
    return 0;
  }

  if (item.type === "video" && item.durationMode !== "clip") {
    return Math.max(0, Math.round(media?.videoProfile?.durationSeconds ?? item.duration ?? 0));
  }

  return Math.max(0, Math.round(item.duration ?? media?.duration ?? 0));
}

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return "0 sec";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remainingSeconds} sec`;
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function mediaMatchesFilter(media: MediaItem, filter: MediaFilter) {
  return filter === "all" || media.type === filter;
}

function mediaMatchesSearch(media: MediaItem, searchTerm: string) {
  const search = searchTerm.trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [media.filename, media.title, media.url]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLowerCase().includes(search));
}

export function PlaylistsPage() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistRecord | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [status, setStatus] = useState("Loading playlists...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [renameTarget, setRenameTarget] = useState<PlaylistRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PlaylistRecord | null>(null);
  const isDirtyRef = useRef(false);
  const selectedPlaylistIdRef = useRef<string | null>(null);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function getMediaById(mediaId: string) {
    return mediaItems.find((media) => media.mediaId === mediaId || media.id === mediaId || media.filename === mediaId);
  }

  function formatPlaylistDuration(playlistRecord: PlaylistRecord) {
    const hasPersistentItem = playlistRecord.items.some((item) => isPersistentWebUrlItem(item, getMediaById(item.mediaId)));
    const totalSeconds = playlistRecord.items.reduce((total, item) => total + getItemDurationSeconds(item, getMediaById(item.mediaId)), 0);

    if (hasPersistentItem && totalSeconds === 0) {
      return "Persistent";
    }

    if (hasPersistentItem) {
      return `${formatDuration(totalSeconds)} + persistent`;
    }

    return formatDuration(totalSeconds);
  }

  function openPlaylist(playlistRecord: PlaylistRecord, options: { discardDirty?: boolean } = {}) {
    if (isDirtyRef.current && !options.discardDirty) {
      setPendingNavigation({ type: "open", playlist: playlistRecord });
      return;
    }

    selectedPlaylistIdRef.current = playlistRecord.id;
    setSelectedPlaylistId(playlistRecord.id);
    setPlaylist({
      ...playlistRecord,
      items: [...playlistRecord.items]
    });
    isDirtyRef.current = false;
    setIsDirty(false);
    setViewMode("editor");
  }

  function backToLibrary(options: { discardDirty?: boolean } = {}) {
    if (isDirtyRef.current && !options.discardDirty) {
      setPendingNavigation({ type: "back" });
      return;
    }

    setViewMode("library");
    setIsAddMediaOpen(false);
    setSelectedMediaIds([]);
    isDirtyRef.current = false;
    setIsDirty(false);
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
      setPlaylists(playlistRecords);

      if (selectedPlaylistIdRef.current) {
        const currentPlaylist = playlistRecords.find((item) => item.id === selectedPlaylistIdRef.current);

        if (currentPlaylist && viewMode === "editor") {
          setPlaylist(currentPlaylist);
        }
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(mediaLoaded ? "Playlist library loaded." : "Playlists loaded. Media library unavailable.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load playlists: ${error.message}` : "Unable to load playlists.");
    } finally {
      setIsBusy(false);
    }
  }

  function addMediaItems(items: MediaItem[]) {
    const readyItems = items.filter(isMediaReadyForPlaylist);
    const blockedCount = items.length - readyItems.length;

    if (readyItems.length === 0) {
      setStatus(blockedCount > 0 ? "Selected videos are still processing or failed normalization." : "No media selected.");
      return;
    }

    setPlaylist((currentPlaylist) => {
      if (!currentPlaylist) {
        return currentPlaylist;
      }

      return {
        ...currentPlaylist,
        items: [...currentPlaylist.items, ...readyItems.map(createPlaylistItem)]
      };
    });
    markDirty();
    setIsAddMediaOpen(false);
    setSelectedMediaIds([]);
    setStatus(
      blockedCount > 0
        ? `Added ${readyItems.length} item(s). ${blockedCount} processing video(s) were skipped.`
        : `Added ${readyItems.length} item(s).`
    );
  }

  function updatePlaylistName(name: string) {
    setPlaylist((currentPlaylist) => (currentPlaylist ? { ...currentPlaylist, name } : currentPlaylist));
    markDirty();
  }

  function removeItem(id: string) {
    setPlaylist((currentPlaylist) =>
      currentPlaylist
        ? {
            ...currentPlaylist,
            items: currentPlaylist.items.filter((item) => item.id !== id)
          }
        : currentPlaylist
    );
    markDirty();
  }

  function reorderItem(fromIndex: number, toIndex: number) {
    setPlaylist((currentPlaylist) => {
      if (!currentPlaylist || fromIndex === toIndex || fromIndex < 0 || fromIndex >= currentPlaylist.items.length) {
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
    setPlaylist((currentPlaylist) =>
      currentPlaylist
        ? {
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
          }
        : currentPlaylist
    );
    markDirty();
  }

  function updateVideoDurationMode(id: string, durationMode: "auto" | "clip") {
    setPlaylist((currentPlaylist) =>
      currentPlaylist
        ? {
            ...currentPlaylist,
            items: currentPlaylist.items.map((item) =>
              item.id === id && item.type === "video" ? { ...item, durationMode } : item
            )
          }
        : currentPlaylist
    );
    markDirty();
  }

  async function savePlaylist(currentPlaylist = playlist) {
    if (!currentPlaylist) {
      return null;
    }

    setIsBusy(true);
    setStatus("Saving playlist...");

    try {
      const endpoint =
        currentPlaylist.id === "default"
          ? apiUrl("/api/playlist")
          : apiUrl(`/api/playlists/${encodeURIComponent(currentPlaylist.id)}`);
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(currentPlaylist)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as PlaylistRecord;
      const savedPlaylist =
        currentPlaylist.id === "default"
          ? {
              ...body,
              id: "default",
              name: body.name ?? currentPlaylist.name
            }
          : body;

      setPlaylist(savedPlaylist);
      setPlaylists((currentPlaylists) =>
        currentPlaylists.some((item) => item.id === savedPlaylist.id)
          ? currentPlaylists.map((item) => (item.id === savedPlaylist.id ? savedPlaylist : item))
          : [...currentPlaylists, savedPlaylist]
      );
      selectedPlaylistIdRef.current = savedPlaylist.id;
      setSelectedPlaylistId(savedPlaylist.id);
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`Saved ${savedPlaylist.name}.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
      return savedPlaylist;
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
      return null;
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
      setPlaylists((currentPlaylists) => [...currentPlaylists, body]);
      openPlaylist(body, { discardDirty: true });
      setStatus(`${body.name} created.`);
      return body;
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function duplicatePlaylist(source: PlaylistRecord) {
    const duplicatedItems = source.items.map((item) => ({
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
    }));
    await createPlaylist(`${source.name} Copy`, duplicatedItems);
  }

  async function renamePlaylist() {
    if (!renameTarget) {
      return;
    }

    const name = renameValue.trim();

    if (!name) {
      setStatus("Playlist name cannot be empty.");
      return;
    }

    const renamedPlaylist = { ...renameTarget, name };
    setRenameTarget(null);
    await savePlaylist(renamedPlaylist);
  }

  async function deletePlaylist(target: PlaylistRecord) {
    if (target.id === "default") {
      setStatus("Default playlist cannot be deleted.");
      setDeleteTarget(null);
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${target.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/playlists/${encodeURIComponent(target.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setPlaylists((currentPlaylists) => currentPlaylists.filter((item) => item.id !== target.id));

      if (selectedPlaylistIdRef.current === target.id) {
        selectedPlaylistIdRef.current = null;
        setSelectedPlaylistId(null);
        setPlaylist(null);
        setViewMode("library");
        isDirtyRef.current = false;
        setIsDirty(false);
      }

      setDeleteTarget(null);
      setStatus(`${target.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function handlePlaylistItemDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-playlist-index", String(index));
  }

  function handlePlaylistItemDrop(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const draggedIndex = event.dataTransfer.getData("application/x-playlist-index");

    if (draggedIndex) {
      reorderItem(Number(draggedIndex), index);
    }
  }

  async function resolvePendingNavigation(action: "cancel" | "discard" | "save") {
    const pending = pendingNavigation;

    if (!pending) {
      return;
    }

    if (action === "cancel") {
      setPendingNavigation(null);
      return;
    }

    if (action === "save") {
      const saved = await savePlaylist();

      if (!saved) {
        return;
      }
    } else {
      isDirtyRef.current = false;
      setIsDirty(false);
    }

    setPendingNavigation(null);

    if (pending.type === "back") {
      backToLibrary({ discardDirty: true });
    } else {
      openPlaylist(pending.playlist, { discardDirty: true });
    }
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

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const filteredMedia = useMemo(
    () => mediaItems.filter((item) => mediaMatchesFilter(item, mediaFilter)).filter((item) => mediaMatchesSearch(item, mediaSearch)),
    [mediaFilter, mediaItems, mediaSearch]
  );
  const filteredPlaylists = playlists.filter((item) =>
    playlistSearch.trim() ? item.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()) : true
  );
  const selectedMedia = selectedMediaIds
    .map((mediaId) => getMediaById(mediaId))
    .filter((item): item is MediaItem => Boolean(item));
  const filterButtons: Array<{ label: string; value: MediaFilter }> = [
    { label: "All", value: "all" },
    { label: "Images", value: "image" },
    { label: "Videos", value: "video" },
    { label: "Web Pages", value: "web_url" },
    { label: "RSS Feeds", value: "rss_feed" }
  ];

  function renderMediaPreview(media?: MediaItem, fallbackType: PlaylistItem["type"] = "image") {
    if (media?.type === "image") {
      return <img alt="" src={apiUrl(`/media/${encodeURIComponent(media.filename)}`)} />;
    }

    if (media?.type === "video" && media.thumbnailFilename) {
      return <img alt="" src={apiUrl(`/thumbnails/${encodeURIComponent(media.thumbnailFilename)}`)} />;
    }

    const type = media?.type ?? fallbackType;
    return <span>{getMediaTypeLabel(type)}</span>;
  }

  function renderPlaylistCard(playlistRecord: PlaylistRecord) {
    const previews = playlistRecord.items
      .slice(0, 4)
      .map((item) => getMediaById(item.mediaId) ?? getMediaById(item.file));

    return (
      <article className="playlist-library-card" key={playlistRecord.id}>
        <button className="playlist-library-open" onClick={() => openPlaylist(playlistRecord)} type="button">
          <div className="playlist-preview-strip" aria-hidden="true">
            {previews.length > 0 ? (
              previews.map((media, index) => (
                <div className="playlist-preview-thumb" key={`${playlistRecord.id}-${index}`}>
                  {renderMediaPreview(media, playlistRecord.items[index]?.type)}
                </div>
              ))
            ) : (
              <div className="playlist-preview-thumb empty">Empty</div>
            )}
          </div>
          <div className="playlist-library-main">
            <strong>{playlistRecord.name}</strong>
            <span>
              {playlistRecord.items.length} item(s) - {formatPlaylistDuration(playlistRecord)}
            </span>
            <span>Last modified: {formatUpdatedAt(playlistRecord.updatedAt)}</span>
          </div>
        </button>
        <details className="playlist-card-menu">
          <summary aria-label={`Actions for ${playlistRecord.name}`}>...</summary>
          <div>
            <button onClick={() => openPlaylist(playlistRecord)} type="button">
              Open
            </button>
            <button disabled={isBusy} onClick={() => void duplicatePlaylist(playlistRecord)} type="button">
              Duplicate
            </button>
            <button
              disabled={isBusy}
              onClick={() => {
                setRenameTarget(playlistRecord);
                setRenameValue(playlistRecord.name);
              }}
              type="button"
            >
              Rename
            </button>
            <button disabled={isBusy || playlistRecord.id === "default"} onClick={() => setDeleteTarget(playlistRecord)} type="button">
              Delete
            </button>
          </div>
        </details>
      </article>
    );
  }

  function renderPlaylistItem(item: PlaylistItem, index: number) {
    const media = getMediaById(item.mediaId) ?? getMediaById(item.file);

    return (
      <article
        className="playlist-editor-row"
        draggable
        key={item.id}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => handlePlaylistItemDragStart(event, index)}
        onDrop={(event) => handlePlaylistItemDrop(event, index)}
      >
        <span className="operator-drag-handle" title="Drag to reorder">
          Drag
        </span>
        <div className="playlist-editor-thumb">{renderMediaPreview(media, item.type)}</div>
        <div className="operator-item-main">
          <strong>{getMediaTitle(media, item.file)}</strong>
          <span>
            {getMediaTypeLabel(item.type)}
            {item.type === "video"
              ? item.durationMode === "clip"
                ? ` - ${formatDuration(item.duration)}`
                : " - full video"
              : isPersistentWebUrlItem(item, media)
                ? " - persistent until schedule changes"
                : ` - ${formatDuration(item.duration)}`}
          </span>
        </div>
        {item.type === "video" ? (
          <fieldset className="operator-duration-options">
            <legend>Duration</legend>
            <label>
              <input
                checked={item.durationMode !== "clip"}
                name={`duration-mode-${item.id}`}
                onChange={() => updateVideoDurationMode(item.id, "auto")}
                type="radio"
              />
              Full video
            </label>
            <label>
              <input
                checked={item.durationMode === "clip"}
                name={`duration-mode-${item.id}`}
                onChange={() => updateVideoDurationMode(item.id, "clip")}
                type="radio"
              />
              Custom:
              <input
                disabled={item.durationMode !== "clip"}
                min="1"
                onChange={(event) => updateDuration(item.id, Number(event.target.value))}
                type="number"
                value={item.duration}
              />
              sec
            </label>
          </fieldset>
        ) : isPersistentWebUrlItem(item, media) ? (
          <span className="playlist-persistent-note">No playlist duration</span>
        ) : (
          <label className="playlist-duration-field">
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
  }

  function renderMediaPickerCard(media: MediaItem) {
    const selected = selectedMediaIds.includes(media.mediaId);
    const disabled = !isMediaReadyForPlaylist(media);

    return (
      <button
        className={selected ? "playlist-picker-card selected" : "playlist-picker-card"}
        disabled={disabled}
        key={media.mediaId}
        onClick={() =>
          setSelectedMediaIds((currentIds) =>
            currentIds.includes(media.mediaId)
              ? currentIds.filter((mediaId) => mediaId !== media.mediaId)
              : [...currentIds, media.mediaId]
          )
        }
        type="button"
      >
        <div className="playlist-picker-thumb">{renderMediaPreview(media)}</div>
        <strong>{getMediaTitle(media)}</strong>
        <span>
          {getMediaTypeLabel(media.type)}
          {disabled ? " - processing" : ""}
        </span>
      </button>
    );
  }

  return (
    <section className="page-section operator-section" id="playlists">
      {viewMode === "library" ? (
        <>
          <div className="section-header">
            <div>
              <h2>Playlists</h2>
              <p>Manage reusable playback sequences.</p>
            </div>
            <div className="button-row">
              <button disabled={isBusy} onClick={() => void loadEditorData({ force: true })} type="button">
                Refresh
              </button>
              <button className="primary-button" disabled={isBusy} onClick={() => void createPlaylist()} type="button">
                + New Playlist
              </button>
            </div>
          </div>

          <p className="status-text">{status}</p>

          <div className="playlist-library-toolbar">
            <input
              aria-label="Search playlists"
              onChange={(event) => setPlaylistSearch(event.target.value)}
              placeholder="Search playlists"
              type="search"
              value={playlistSearch}
            />
            <span>{filteredPlaylists.length} playlist(s)</span>
          </div>

          <div className="playlist-library-grid">
            {filteredPlaylists.length > 0 ? (
              filteredPlaylists.map(renderPlaylistCard)
            ) : (
              <p className="operator-empty">No playlists found. Create a new playlist to start arranging media.</p>
            )}
          </div>
        </>
      ) : playlist ? (
        <>
          <div className="playlist-editor-header">
            <button className="text-button" onClick={() => backToLibrary()} type="button">
              Back to Playlists
            </button>
            <div className="playlist-editor-title-row">
              <input
                aria-label="Playlist name"
                className="operator-title-input"
                onChange={(event) => updatePlaylistName(event.target.value)}
                value={playlist.name}
              />
              <span>
                {playlist.items.length} item(s) - {formatPlaylistDuration(playlist)}
              </span>
            </div>
            <div className="button-row">
              <button disabled={isBusy} onClick={() => setIsAddMediaOpen(true)} type="button">
                Add Media
              </button>
              <button className="primary-button" disabled={isBusy || !isDirty} onClick={() => void savePlaylist()} type="button">
                Save Changes
              </button>
            </div>
          </div>

          <p className="status-text">
            {status}
            {isDirty ? " Unsaved changes." : ""}
          </p>

          <div className="playlist-editor-list">
            {playlist.items.length > 0 ? (
              playlist.items.map(renderPlaylistItem)
            ) : (
              <p className="operator-empty">No media in this playlist yet. Use Add Media to choose items.</p>
            )}
          </div>
        </>
      ) : null}

      {isAddMediaOpen ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal playlist-media-modal" role="dialog">
            <div className="playlist-modal-header">
              <div>
                <h3>Add media</h3>
                <p>Select one or more media items to append to this playlist.</p>
              </div>
              <button
                aria-label="Close add media"
                onClick={() => {
                  setIsAddMediaOpen(false);
                  setSelectedMediaIds([]);
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <input
              aria-label="Search media"
              onChange={(event) => setMediaSearch(event.target.value)}
              placeholder="Search media"
              type="search"
              value={mediaSearch}
            />
            <div className="media-category-tabs">
              {filterButtons.map((button) => (
                <button
                  className={mediaFilter === button.value ? "active" : ""}
                  key={button.value}
                  onClick={() => setMediaFilter(button.value)}
                  type="button"
                >
                  {button.label}
                </button>
              ))}
            </div>
            <div className="playlist-picker-grid">
              {filteredMedia.length > 0 ? filteredMedia.map(renderMediaPickerCard) : <p className="operator-empty">No media found.</p>}
            </div>
            <div className="media-trash-modal-actions">
              <button
                onClick={() => {
                  setIsAddMediaOpen(false);
                  setSelectedMediaIds([]);
                }}
                type="button"
              >
                Cancel
              </button>
              <button className="primary-button" disabled={selectedMedia.length === 0} onClick={() => addMediaItems(selectedMedia)} type="button">
                Add selected media
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingNavigation ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Unsaved changes</h3>
            <p>This playlist has changes that have not been saved.</p>
            <div className="media-trash-modal-actions">
              <button onClick={() => void resolvePendingNavigation("cancel")} type="button">
                Cancel
              </button>
              <button className="danger-button" onClick={() => void resolvePendingNavigation("discard")} type="button">
                Discard Changes
              </button>
              <button className="primary-button" disabled={isBusy} onClick={() => void resolvePendingNavigation("save")} type="button">
                Save and Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Rename playlist</h3>
            <input
              aria-label="Playlist name"
              onChange={(event) => setRenameValue(event.target.value)}
              type="text"
              value={renameValue}
            />
            <div className="media-trash-modal-actions">
              <button onClick={() => setRenameTarget(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={isBusy || !renameValue.trim()} onClick={() => void renamePlaylist()} type="button">
                Rename
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Delete playlist</h3>
            <p>Delete "{deleteTarget.name}"? This does not delete media from the Media Library.</p>
            <div className="media-trash-modal-actions">
              <button onClick={() => setDeleteTarget(null)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={isBusy} onClick={() => void deletePlaylist(deleteTarget)} type="button">
                Delete Playlist
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
