import { useEffect, useState } from "react";
import type { MediaItem } from "../mediaTypes";
import type { Playlist, PlaylistItem } from "../playlistTypes";

const mediaUrl = "http://localhost:3000/api/media";
const playlistUrl = "http://localhost:3000/api/playlist";

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
  const [playlist, setPlaylist] = useState<Playlist>({
    version: 0,
    updatedAt: "",
    items: []
  });
  const [status, setStatus] = useState("Loading playlist...");
  const [isBusy, setIsBusy] = useState(false);

  async function loadEditorData() {
    setIsBusy(true);

    try {
      const [mediaResponse, playlistResponse] = await Promise.all([
        fetch(mediaUrl),
        fetch(playlistUrl)
      ]);

      if (!mediaResponse.ok) {
        throw new Error(`media HTTP ${mediaResponse.status}`);
      }

      if (!playlistResponse.ok) {
        throw new Error(`playlist HTTP ${playlistResponse.status}`);
      }

      const mediaBody = (await mediaResponse.json()) as MediaItem[];
      const playlistBody = (await playlistResponse.json()) as Playlist;

      setMediaItems(mediaBody);
      setPlaylist(playlistBody);
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
  }

  function removeItem(id: string) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.filter((item) => item.id !== id)
    }));
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
  }

  function updateDuration(id: string, duration: number) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) =>
        item.id === id ? { ...item, duration: Math.max(duration, 1) } : item
      )
    }));
  }

  async function savePlaylist() {
    setIsBusy(true);
    setStatus("Saving playlist...");

    try {
      const response = await fetch(playlistUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(playlist)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Playlist;
      setPlaylist(body);
      setStatus(`Playlist saved as version ${body.version}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadEditorData();
  }, []);

  return (
    <section className="page-section" id="playlists">
      <div className="section-header">
        <div>
          <h2>Playlists</h2>
          <p>Single local playlist used to generate the player schedule.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void loadEditorData()} type="button">
            Refresh
          </button>
          <button disabled={isBusy} onClick={() => void savePlaylist()} type="button">
            Save
          </button>
        </div>
      </div>

      <p className="status-text">{status}</p>

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
            <h3>Playlist</h3>
            <span>Version {playlist.version}</span>
          </div>

          <div className="playlist-items">
            {playlist.items.length === 0 ? <p>No playlist items yet.</p> : null}

            {playlist.items.map((item, index) => (
              <article className="playlist-item-row" key={item.id}>
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
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
