import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { BrowserAction, MediaItem } from "../mediaTypes";

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

function createBrowserAction(type: BrowserAction["type"]): BrowserAction {
  const id = `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (type === "wait") {
    return { id, type: "wait", waitMs: 3000 };
  }

  if (type === "click") {
    return { id, type: "click", selector: "", timeoutMs: 5000 };
  }

  return { id, type: "refresh_interval", intervalSeconds: 300 };
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
  const [externalWebUrlRenderMode, setExternalWebUrlRenderMode] = useState<"iframe" | "browser">("iframe");
  const [externalBrowserActions, setExternalBrowserActions] = useState<BrowserAction[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDuration, setEditDuration] = useState(10);
  const [editMaxItems, setEditMaxItems] = useState(5);
  const [editWebUrlRenderMode, setEditWebUrlRenderMode] = useState<"iframe" | "browser">("iframe");
  const [editBrowserActions, setEditBrowserActions] = useState<BrowserAction[]>([]);

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
          webUrlRenderMode: externalType === "web_url" ? externalWebUrlRenderMode : undefined,
          browserActions: externalType === "web_url" && externalWebUrlRenderMode === "browser" ? externalBrowserActions : undefined,
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
      setExternalWebUrlRenderMode("iframe");
      setExternalBrowserActions([]);
      setStatus("External media created.");
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function startEditing(item: MediaItem) {
    setEditingItemId(item.mediaId);
    setEditTitle(item.title ?? "");
    setEditUrl(item.url ?? "");
    setEditDuration(item.duration ?? 10);
    setEditMaxItems(item.maxItems ?? 5);
    setEditWebUrlRenderMode(item.webUrlRenderMode ?? "iframe");
    setEditBrowserActions(item.browserActions ?? []);
  }

  async function saveExternalMedia(item: MediaItem) {
    setIsBusy(true);
    setStatus(`Saving ${item.title ?? item.filename}...`);

    try {
      const response = await fetch(apiUrl(`/api/media/${encodeURIComponent(item.mediaId)}/external`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: editTitle.trim() || undefined,
          url: editUrl.trim(),
          duration: editDuration,
          maxItems: item.type === "rss_feed" ? editMaxItems : undefined,
          webUrlRenderMode: item.type === "web_url" ? editWebUrlRenderMode : undefined,
          browserActions: item.type === "web_url" && editWebUrlRenderMode === "browser" ? editBrowserActions : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setEditingItemId(null);
      setStatus("External media saved.");
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateBrowserAction(
    actions: BrowserAction[],
    setActions: (actions: BrowserAction[]) => void,
    index: number,
    patch: Partial<BrowserAction>
  ) {
    setActions(actions.map((action, actionIndex) => (actionIndex === index ? ({ ...action, ...patch } as BrowserAction) : action)));
  }

  function renderBrowserActionsEditor(actions: BrowserAction[], setActions: (actions: BrowserAction[]) => void) {
    return (
      <div className="browser-actions-editor">
        <div>
          <strong>Browser automation</strong>
          <p>
            Browser automation is website-specific. If a website changes, selectors may need updating.
          </p>
        </div>
        {actions.length === 0 ? <p>No automation actions configured.</p> : null}
        {actions.map((action, index) => (
          <div className="browser-action-row" key={action.id ?? index}>
            <label>
              Action
              <select
                value={action.type}
                onChange={(event) => {
                  const nextAction = createBrowserAction(event.target.value as BrowserAction["type"]);
                  setActions(actions.map((candidate, actionIndex) => (actionIndex === index ? nextAction : candidate)));
                }}
              >
                <option value="wait">WAIT</option>
                <option value="click">CLICK</option>
                <option value="refresh_interval">REFRESH</option>
              </select>
            </label>
            {action.type === "wait" ? (
              <label>
                Wait ms
                <input
                  min={0}
                  max={15000}
                  type="number"
                  value={action.waitMs}
                  onChange={(event) =>
                    updateBrowserAction(actions, setActions, index, {
                      waitMs: Math.max(Math.min(Number(event.target.value), 15000), 0)
                    })
                  }
                />
              </label>
            ) : null}
            {action.type === "click" ? (
              <>
                <label>
                  CSS selector
                  <input
                    placeholder="button[data-testid='accept']"
                    value={action.selector}
                    onChange={(event) =>
                      updateBrowserAction(actions, setActions, index, {
                        selector: event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  Timeout ms
                  <input
                    min={0}
                    max={15000}
                    type="number"
                    value={action.timeoutMs ?? 5000}
                    onChange={(event) =>
                      updateBrowserAction(actions, setActions, index, {
                        timeoutMs: Math.max(Math.min(Number(event.target.value), 15000), 0)
                      })
                    }
                  />
                </label>
              </>
            ) : null}
            {action.type === "refresh_interval" ? (
              <label>
                Interval seconds
                <input
                  min={30}
                  type="number"
                  value={action.intervalSeconds}
                  onChange={(event) =>
                    updateBrowserAction(actions, setActions, index, {
                      intervalSeconds: Math.max(Number(event.target.value), 30)
                    })
                  }
                />
              </label>
            ) : null}
            <div className="button-row">
              <button disabled={index === 0} onClick={() => {
                const nextActions = [...actions];
                [nextActions[index - 1], nextActions[index]] = [nextActions[index], nextActions[index - 1]];
                setActions(nextActions);
              }} type="button">
                Up
              </button>
              <button disabled={index === actions.length - 1} onClick={() => {
                const nextActions = [...actions];
                [nextActions[index], nextActions[index + 1]] = [nextActions[index + 1], nextActions[index]];
                setActions(nextActions);
              }} type="button">
                Down
              </button>
              <button onClick={() => setActions(actions.filter((_, actionIndex) => actionIndex !== index))} type="button">
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="button-row">
          <button disabled={actions.length >= 5} onClick={() => setActions([...actions, createBrowserAction("wait")])} type="button">
            Add WAIT
          </button>
          <button disabled={actions.length >= 5} onClick={() => setActions([...actions, createBrowserAction("click")])} type="button">
            Add CLICK
          </button>
          <button disabled={actions.length >= 5} onClick={() => setActions([...actions, createBrowserAction("refresh_interval")])} type="button">
            Add REFRESH
          </button>
        </div>
      </div>
    );
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
          {externalType === "web_url" ? (
            <label>
              Render mode
              <select
                value={externalWebUrlRenderMode}
                onChange={(event) => setExternalWebUrlRenderMode(event.target.value as "iframe" | "browser")}
              >
                <option value="iframe">Embedded iframe</option>
                <option value="browser">Browser renderer</option>
              </select>
              <small>
                Embedded iframe werkt alleen als de website dit toestaat. Browser renderer gebruikt de lokale
                Chromium-kiosk en kan ook websites tonen die iframe blokkeren.
              </small>
            </label>
          ) : null}
          {externalType === "web_url" && externalWebUrlRenderMode === "browser"
            ? renderBrowserActionsEditor(externalBrowserActions, setExternalBrowserActions)
            : null}
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
              {editingItemId === item.mediaId && (item.type === "web_url" || item.type === "rss_feed") ? (
                <div className="media-card-editor">
                  <label>
                    Title
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                  </label>
                  <label>
                    URL
                    <input value={editUrl} onChange={(event) => setEditUrl(event.target.value)} />
                  </label>
                  <label>
                    Duration
                    <input
                      min={1}
                      type="number"
                      value={editDuration}
                      onChange={(event) => setEditDuration(Math.max(Number(event.target.value), 1))}
                    />
                  </label>
                  {item.type === "rss_feed" ? (
                    <label>
                      Max items
                      <input
                        min={1}
                        max={20}
                        type="number"
                        value={editMaxItems}
                        onChange={(event) => setEditMaxItems(Math.max(Math.min(Number(event.target.value), 20), 1))}
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        Render mode
                        <select
                          value={editWebUrlRenderMode}
                          onChange={(event) => setEditWebUrlRenderMode(event.target.value as "iframe" | "browser")}
                        >
                          <option value="iframe">Embedded iframe</option>
                          <option value="browser">Browser renderer</option>
                        </select>
                      </label>
                      {editWebUrlRenderMode === "browser"
                        ? renderBrowserActionsEditor(editBrowserActions, setEditBrowserActions)
                        : null}
                    </>
                  )}
                  <div className="button-row">
                    <button disabled={isBusy || !editUrl.trim()} onClick={() => void saveExternalMedia(item)} type="button">
                      Save
                    </button>
                    <button disabled={isBusy} onClick={() => setEditingItemId(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3>{item.title ?? item.filename}</h3>
                    <p>
                      {item.type === "image" || item.type === "video"
                        ? `${item.type} | ${formatFileSize(item.size)}`
                        : `${item.type} | ${item.url ?? ""}`}
                    </p>
                    {item.type === "web_url" ? <p>Render mode: {item.webUrlRenderMode ?? "iframe"}</p> : null}
                    {item.type === "web_url" && item.browserActions && item.browserActions.length > 0 ? (
                      <p>Automation actions: {item.browserActions.length}</p>
                    ) : null}
                  </div>
                  <div className="button-row">
                    {item.type === "web_url" || item.type === "rss_feed" ? (
                      <button disabled={isBusy} onClick={() => startEditing(item)} type="button">
                        Edit
                      </button>
                    ) : null}
                    <button disabled={isBusy} onClick={() => void deleteItem(item)} type="button">
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
