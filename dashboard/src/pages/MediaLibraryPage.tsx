import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { MediaItem } from "../mediaTypes";

const refreshIntervalMs = 10_000;

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("Loading media library...");
  const [isBusy, setIsBusy] = useState(false);
  const [externalType, setExternalType] = useState<"web_url" | "rss_feed">("web_url");
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalDuration, setExternalDuration] = useState(10);
  const [externalMaxItems, setExternalMaxItems] = useState(5);

  async function loadMedia() {
    setIsBusy(true);

    try {
      const response = await fetch(apiUrl("/api/media"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as MediaItem[];
      setItems(body);
      setStatus(body.length === 0 ? "No media uploaded yet." : `${body.length} media item(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load media: ${error.message}` : "Unable to load media.");
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsBusy(true);
    setStatus(`Uploading ${file.name}...`);

    try {
      const response = await fetch(apiUrl("/api/media"), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus(`${file.name} uploaded.`);
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  }

  async function deleteItem(item: MediaItem) {
    setIsBusy(true);
    setStatus(`Deleting ${item.filename}...`);

    try {
      const response = await fetch(apiUrl(`/api/media/${encodeURIComponent(item.mediaId)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus(`${item.filename} deleted.`);
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createExternalMedia() {
    setIsBusy(true);
    setStatus(`Creating ${externalType === "web_url" ? "Web URL" : "RSS Feed"} media...`);

    try {
      const response = await fetch(apiUrl("/api/media/external"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: externalType,
          title: externalTitle.trim() || undefined,
          url: externalUrl.trim(),
          duration: externalDuration,
          maxItems: externalType === "rss_feed" ? externalMaxItems : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setExternalTitle("");
      setExternalUrl("");
      setExternalDuration(10);
      setExternalMaxItems(5);
      setStatus("External media created.");
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadMedia();
    const timer = window.setInterval(() => {
      void loadMedia();
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="page-section" id="media-library">
      <div className="section-header">
        <div>
          <h2>Media Library</h2>
          <p>Images, videos, Web URLs, and RSS feeds available for playlists.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => inputRef.current?.click()} type="button">
            Upload
          </button>
          <button disabled={isBusy} onClick={() => void loadMedia()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <input
        accept="image/*,video/mp4,video/webm"
        className="visually-hidden"
        onChange={(event) => void uploadFile(event)}
        ref={inputRef}
        type="file"
      />

      <p className="status-text">{status}</p>

      <section className="operator-panel">
        <h3>Add Dynamic Content</h3>
        <div className="playlist-schedule-fields">
          <label>
            Type
            <select value={externalType} onChange={(event) => setExternalType(event.target.value as "web_url" | "rss_feed")}>
              <option value="web_url">Web URL</option>
              <option value="rss_feed">RSS Feed</option>
            </select>
          </label>
          <label>
            Title
            <input value={externalTitle} onChange={(event) => setExternalTitle(event.target.value)} placeholder="Optional title" />
          </label>
          <label>
            URL
            <input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://example.com" />
          </label>
          <label>
            Duration
            <input
              min={1}
              type="number"
              value={externalDuration}
              onChange={(event) => setExternalDuration(Math.max(Number(event.target.value), 1))}
            />
          </label>
          {externalType === "rss_feed" ? (
            <label>
              Max items
              <input
                min={1}
                max={20}
                type="number"
                value={externalMaxItems}
                onChange={(event) => setExternalMaxItems(Math.max(Math.min(Number(event.target.value), 20), 1))}
              />
            </label>
          ) : null}
          <button disabled={isBusy || !externalUrl.trim()} onClick={() => void createExternalMedia()} type="button">
            Add
          </button>
        </div>
      </section>

      <div className="media-grid">
        {items.map((item) => (
          <article className="media-card" key={item.mediaId}>
            {item.type === "image" ? (
              <img alt="" src={apiUrl(`/media/${encodeURIComponent(item.filename)}`)} />
            ) : item.type === "video" ? (
              <div className="media-video-placeholder">
                <span>Video</span>
              </div>
            ) : (
              <div className="media-video-placeholder">
                <span>{item.type === "web_url" ? "Web URL" : "RSS"}</span>
              </div>
            )}
            <div className="media-card-body">
              <div>
                <h3>{item.title ?? item.filename}</h3>
                <p>
                  {item.type === "image" || item.type === "video"
                    ? `${item.type} | ${formatFileSize(item.size)}`
                    : `${item.type} | ${item.url ?? ""}`}
                </p>
              </div>
              <button disabled={isBusy} onClick={() => void deleteItem(item)} type="button">
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
