import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { apiUrl } from "../api/apiBase";
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

async function readApiError(response: Response) {
  const body: unknown = await response.json().catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return `HTTP ${response.status}`;
}

export function MediaLibraryPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("Loading media library...");
  const [isBusy, setIsBusy] = useState(false);

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
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus(`${item.filename} deleted.`);
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
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
          <p>Uploaded image and video media stored on the local server.</p>
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

      <div className="media-grid">
        {items.map((item) => (
          <article className="media-card" key={item.mediaId}>
            {item.type === "image" ? (
              <img alt="" src={apiUrl(`/media/${encodeURIComponent(item.filename)}`)} />
            ) : (
              <div className="media-video-placeholder">
                <span>Video</span>
              </div>
            )}
            <div className="media-card-body">
              <div>
                <h3>{item.filename}</h3>
                <p>
                  {item.type} | {formatFileSize(item.size)}
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
