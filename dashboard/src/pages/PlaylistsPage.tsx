import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { MediaItem } from "../mediaTypes";
import type { PlaylistRecord, PlaylistItem } from "../playlistTypes";

const refreshIntervalMs = 10_000;

function createPlaylistItem(media: MediaItem): PlaylistItem {
  return {
    id: `item-${Date.now()}-${media.id}`,
    mediaId: media.id,
    type: media.type,
    file: media.filename,
    duration: 10
  };
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
  const [status, setStatus] = useState("Loading playlist...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  async function loadEditorData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      return;
    }

    setIsBusy(true);

    try {
      const [mediaResponse, playlistResponse] = await Promise.all([
        fetch(apiUrl("/api/media")),
        fetch(apiUrl("/api/playlists"))
      ]);

      if (!mediaResponse.ok) {
        throw new Error(`media HTTP ${mediaResponse.status}`);
      }

      if (!playlistResponse.ok) {
        throw new Error(`playlist HTTP ${playlistResponse.status}`);
      }

      const mediaBody = (await mediaResponse.json()) as MediaItem[];
      const playlistBody = (await playlistResponse.json()) as PlaylistRecord[];
      const selectedPlaylist =
        playlistBody.find((item) => item.id === selectedPlaylistId) ?? playlistBody[0];

      setMediaItems(mediaBody);
      setPlaylists(playlistBody);

      if (selectedPlaylist) {
        setSelectedPlaylistId(selectedPlaylist.id);
        setPlaylist(selectedPlaylist);
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Playlist loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load playlist: ${error.message}` : "Unable to load playlist.");
    } finally {
      setIsBusy(false);
    }
  }

  function addMediaItem(media: MediaItem) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: [...currentPlaylist.items, createPlaylistItem(media)]
    }));
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

  function moveItem(index: number, direction: -1 | 1) {
    setPlaylist((currentPlaylist) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentPlaylist.items.length) {
        return currentPlaylist;
      }

      const items = [...currentPlaylist.items];
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);

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
        item.id === id ? { ...item, duration: Math.max(duration, 1) } : item
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
      setPlaylist(
        playlist.id === "default"
          ? {
              ...body,
              id: "default",
              name: playlist.name
            }
          : body
      );
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`Playlist saved as version ${body.version}.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
      await loadEditorData({ force: true });
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createPlaylist() {
    setIsBusy(true);
    setStatus("Creating playlist...");

    try {
      const response = await fetch(apiUrl("/api/playlists"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: "New Playlist", items: [] })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as PlaylistRecord;
      setSelectedPlaylistId(body.id);
      setPlaylist(body);
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadEditorData({ force: true });
      setStatus(`${body.name} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteSelectedPlaylist() {
    if (playlist.id === "default") {
      setStatus("Default playlist cannot be deleted.");
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${playlist.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/playlists/${encodeURIComponent(playlist.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setSelectedPlaylistId("default");
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadEditorData({ force: true });
      setStatus(`${playlist.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
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

  return (
    <section className="page-section" id="playlists">
      <div className="section-header">
        <div>
          <h2>Playlists</h2>
          <p>Reusable ordered media lists for programs.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void createPlaylist()} type="button">
            Create Playlist
          </button>
          <button disabled={isBusy} onClick={() => void loadEditorData({ force: true })} type="button">
            Refresh
          </button>
          <button disabled={isBusy} onClick={() => void savePlaylist()} type="button">
            Save
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="playlist-editor">
        <section className="playlist-panel" aria-label="Media available for playlist">
          <h3>Media</h3>
          <div className="playlist-media-list">
            {mediaItems.map((media) => (
              <article className="playlist-media-row" key={media.id}>
                <div>
                  <strong>{media.filename}</strong>
                  <span>{media.type}</span>
                </div>
                <button disabled={isBusy} onClick={() => addMediaItem(media)} type="button">
                  Add
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="playlist-panel" aria-label="Current playlist">
          <div className="playlist-panel-header">
            <h3>{playlist.name}</h3>
            <span>Version {playlist.version}</span>
          </div>

          <div className="playlist-management">
            <label>
              Edit playlist
              <select
                disabled={isBusy}
                onChange={(event) => {
                  const nextPlaylist = playlists.find((item) => item.id === event.target.value);

                  if (nextPlaylist) {
                    setSelectedPlaylistId(nextPlaylist.id);
                    setPlaylist(nextPlaylist);
                    isDirtyRef.current = false;
                    setIsDirty(false);
                  }
                }}
                value={playlist.id}
              >
                {playlists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Playlist name
              <input
                disabled={playlist.id === "default"}
                onChange={(event) => updatePlaylistName(event.target.value)}
                type="text"
                value={playlist.name}
              />
            </label>

            <button disabled={isBusy || playlist.id === "default"} onClick={() => void deleteSelectedPlaylist()} type="button">
              Delete Playlist
            </button>
          </div>

          <div className="playlist-items">
            {playlist.items.length === 0 ? <p>No playlist items yet.</p> : null}

            {playlist.items.map((item, index) => (
              <article className="playlist-item-row" key={item.id}>
                <div className="playlist-item-topline">
                  <div className="playlist-item-main">
                    <strong>{item.file}</strong>
                    <span>{item.type}</span>
                  </div>
                  <label>
                    Duration
                    <input
                      min="1"
                      onChange={(event) => updateDuration(item.id, Number(event.target.value))}
                      type="number"
                      value={item.duration}
                    />
                  </label>
                  <div className="playlist-actions">
                    <button disabled={isBusy || index === 0} onClick={() => moveItem(index, -1)} type="button">
                      Up
                    </button>
                    <button
                      disabled={isBusy || index === playlist.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button disabled={isBusy} onClick={() => removeItem(item.id)} type="button">
                      Remove
                    </button>
                  </div>
                </div>

              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
