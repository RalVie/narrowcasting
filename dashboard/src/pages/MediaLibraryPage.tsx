import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { BrowserAction, MediaItem, RssStyle } from "../mediaTypes";

const refreshIntervalMs = 10_000;
const defaultRssStyle: Required<RssStyle> = {
  backgroundColor: "#000000",
  textColor: "#f8fbff",
  titleColor: "#ffffff",
  accentColor: "#c4f1d7",
  cardBackgroundColor: "#111a15",
  titleSize: "normal",
  bodySize: "normal",
  metaSize: "normal"
};

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

function serializeBrowserActions(actions: BrowserAction[]) {
  return actions.map((action) => {
    if (action.type === "wait") {
      return {
        id: action.id,
        type: action.type,
        waitMs: action.waitMs
      };
    }

    if (action.type === "click") {
      return {
        id: action.id,
        type: action.type,
        selector: action.selector,
        timeoutMs: action.timeoutMs ?? 5000
      };
    }

    return {
      id: action.id,
      type: action.type,
      intervalSeconds: action.intervalSeconds
    };
  });
}

function getVideoProcessingStatus(item: MediaItem) {
  if (item.type !== "video") {
    return null;
  }

  return item.processingStatus ?? "ready";
}

function getVideoProcessingLabel(item: MediaItem) {
  const status = getVideoProcessingStatus(item);

  if (!status) {
    return null;
  }

  if (status === "ready") {
    return "Ready";
  }

  if (status === "failed") {
    return "Normalization failed";
  }

  if (status === "processing") {
    return "Normalizing...";
  }

  if (status === "analyzing") {
    return "Analyzing...";
  }

  return "Uploading...";
}

interface RssPreviewItem {
  title: string;
  summary: string | null;
  link: string | null;
  image: string | null;
  publishedAt: string | null;
}

interface RssPreviewState {
  status: "idle" | "loading" | "ready" | "error";
  message?: string;
  items: RssPreviewItem[];
}

const emptyRssPreview: RssPreviewState = {
  status: "idle",
  items: []
};

function formatPreviewDate(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

function getSummaryExcerpt(value: string | null) {
  if (!value) {
    return "No description available.";
  }

  return value.length > 180 ? `${value.slice(0, 177).trim()}...` : value;
}

function getRssStyleWithDefaults(style?: RssStyle): Required<RssStyle> {
  return {
    ...defaultRssStyle,
    ...(style ?? {})
  };
}

function getRssPreviewStyle(style: RssStyle): CSSProperties {
  const resolvedStyle = getRssStyleWithDefaults(style);

  return {
    "--rss-preview-accent": resolvedStyle.accentColor,
    "--rss-preview-background": resolvedStyle.backgroundColor,
    "--rss-preview-card-background": resolvedStyle.cardBackgroundColor,
    "--rss-preview-text": resolvedStyle.textColor,
    "--rss-preview-title": resolvedStyle.titleColor,
    "--rss-preview-body-size": getPreviewTextSize(resolvedStyle.bodySize, "body"),
    "--rss-preview-meta-size": getPreviewTextSize(resolvedStyle.metaSize, "meta"),
    "--rss-preview-title-size": getPreviewTextSize(resolvedStyle.titleSize, "title")
  } as CSSProperties;
}

function getPreviewTextSize(size: RssStyle["titleSize"], role: "body" | "meta" | "title") {
  const values = {
    body: {
      small: "12px",
      normal: "13px",
      large: "15px",
      "extra-large": "17px"
    },
    meta: {
      small: "11px",
      normal: "12px",
      large: "14px",
      "extra-large": "16px"
    },
    title: {
      small: "13px",
      normal: "14px",
      large: "16px",
      "extra-large": "18px"
    }
  } as const;

  return values[role][size ?? "normal"];
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
  const [externalWebUrlPlaybackMode, setExternalWebUrlPlaybackMode] = useState<"timed" | "persistent">("timed");
  const [externalMaxItems, setExternalMaxItems] = useState(5);
  const [externalRssStyle, setExternalRssStyle] = useState<RssStyle>(defaultRssStyle);
  const [externalWebUrlRenderMode, setExternalWebUrlRenderMode] = useState<"iframe" | "browser">("iframe");
  const [externalBrowserActions, setExternalBrowserActions] = useState<BrowserAction[]>([]);
  const [externalRssPreview, setExternalRssPreview] = useState<RssPreviewState>(emptyRssPreview);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editDuration, setEditDuration] = useState(10);
  const [editWebUrlPlaybackMode, setEditWebUrlPlaybackMode] = useState<"timed" | "persistent">("timed");
  const [editMaxItems, setEditMaxItems] = useState(5);
  const [editRssStyle, setEditRssStyle] = useState<RssStyle>(defaultRssStyle);
  const [editWebUrlRenderMode, setEditWebUrlRenderMode] = useState<"iframe" | "browser">("iframe");
  const [editBrowserActions, setEditBrowserActions] = useState<BrowserAction[]>([]);
  const [editRssPreview, setEditRssPreview] = useState<RssPreviewState>(emptyRssPreview);

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

      setStatus(`${file.name} uploaded. Video normalization will continue in the background.`);
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

  async function retryNormalization(item: MediaItem) {
    setIsBusy(true);
    setStatus(`Retrying normalization for ${item.filename}...`);

    try {
      const response = await fetch(apiUrl(`/api/media/${encodeURIComponent(item.mediaId)}/retry-normalization`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus(`Normalization restarted for ${item.filename}.`);
      await loadMedia();
    } catch (error) {
      setStatus(error instanceof Error ? `Retry failed: ${error.message}` : "Retry failed.");
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
          webUrlPlaybackMode: externalType === "web_url" ? externalWebUrlPlaybackMode : undefined,
          webUrlRenderMode: externalType === "web_url" ? externalWebUrlRenderMode : undefined,
          browserActions: externalType === "web_url" && externalWebUrlRenderMode === "browser"
            ? serializeBrowserActions(externalBrowserActions)
            : undefined,
          maxItems: externalType === "rss_feed" ? externalMaxItems : undefined,
          rssStyle: externalType === "rss_feed" ? getRssStyleWithDefaults(externalRssStyle) : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setExternalTitle("");
      setExternalUrl("");
      setExternalDuration(10);
      setExternalWebUrlPlaybackMode("timed");
      setExternalMaxItems(5);
      setExternalRssStyle(defaultRssStyle);
      setExternalWebUrlRenderMode("iframe");
      setExternalBrowserActions([]);
      setExternalRssPreview(emptyRssPreview);
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
    setEditWebUrlPlaybackMode(item.webUrlPlaybackMode ?? "timed");
    setEditMaxItems(item.maxItems ?? 5);
    setEditRssStyle(getRssStyleWithDefaults(item.rssStyle));
    setEditWebUrlRenderMode(item.webUrlRenderMode ?? "iframe");
    setEditBrowserActions(item.browserActions ?? []);
    setEditRssPreview(emptyRssPreview);
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
          webUrlPlaybackMode: item.type === "web_url" ? editWebUrlPlaybackMode : undefined,
          maxItems: item.type === "rss_feed" ? editMaxItems : undefined,
          rssStyle: item.type === "rss_feed" ? getRssStyleWithDefaults(editRssStyle) : undefined,
          webUrlRenderMode: item.type === "web_url" ? editWebUrlRenderMode : undefined,
          browserActions: item.type === "web_url" && editWebUrlRenderMode === "browser"
            ? serializeBrowserActions(editBrowserActions)
            : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setEditingItemId(null);
      setEditRssPreview(emptyRssPreview);
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

  function renderRssStyleEditor(style: RssStyle, setStyle: (style: RssStyle) => void) {
    const resolvedStyle = getRssStyleWithDefaults(style);
    const controls: Array<{ field: keyof Required<RssStyle>; label: string }> = [
      { field: "backgroundColor", label: "Background" },
      { field: "textColor", label: "Text" },
      { field: "titleColor", label: "Title" },
      { field: "accentColor", label: "Accent" },
      { field: "cardBackgroundColor", label: "Card background" }
    ];

    return (
      <div className="rss-style-editor">
        <strong>RSS colors</strong>
        <div className="rss-style-grid">
          {controls.map((control) => (
            <label key={control.field}>
              {control.label}
              <input
                type="color"
                value={resolvedStyle[control.field]}
                onChange={(event) => setStyle({ ...resolvedStyle, [control.field]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <strong>RSS text sizes</strong>
        <div className="rss-style-grid">
          <label>
            Title size
            <select
              value={resolvedStyle.titleSize}
              onChange={(event) => setStyle({ ...resolvedStyle, titleSize: event.target.value as RssStyle["titleSize"] })}
            >
              <option value="small">Small</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra-large</option>
            </select>
          </label>
          <label>
            Text size
            <select
              value={resolvedStyle.bodySize}
              onChange={(event) => setStyle({ ...resolvedStyle, bodySize: event.target.value as RssStyle["bodySize"] })}
            >
              <option value="small">Small</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra-large</option>
            </select>
          </label>
          <label>
            Date/source size
            <select
              value={resolvedStyle.metaSize}
              onChange={(event) => setStyle({ ...resolvedStyle, metaSize: event.target.value as RssStyle["metaSize"] })}
            >
              <option value="small">Small</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra-large</option>
            </select>
          </label>
        </div>
      </div>
    );
  }

  async function previewRssFeed(url: string, maxItems: number, setPreview: (preview: RssPreviewState) => void) {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setPreview({
        status: "error",
        message: "Enter an RSS feed URL before previewing.",
        items: []
      });
      return;
    }

    setPreview({
      status: "loading",
      message: "Loading feed preview...",
      items: []
    });

    try {
      const response = await fetch(apiUrl("/api/media/rss-preview"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: trimmedUrl,
          maxItems
        })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as { ok: boolean; items: RssPreviewItem[]; message?: string };
      setPreview({
        status: body.ok ? "ready" : "error",
        message: body.message ?? (body.ok ? `${body.items.length} item(s) found.` : "The feed could not be loaded."),
        items: body.items ?? []
      });
    } catch (error) {
      setPreview({
        status: "error",
        message: error instanceof Error ? error.message : "The feed could not be loaded.",
        items: []
      });
    }
  }

  function renderRssPreview(preview: RssPreviewState, style: RssStyle) {
    if (preview.status === "idle") {
      return null;
    }

    return (
      <div className={`rss-preview-panel ${preview.status}`} style={getRssPreviewStyle(style)}>
        {preview.message ? <p>{preview.message}</p> : null}
        {preview.items.length > 0 ? (
          <div className="rss-preview-list">
            {preview.items.map((item, index) => (
              <article className="rss-preview-item" key={`${item.link ?? item.title}-${index}`}>
                {item.image ? <img alt="" src={item.image} /> : <div className="rss-preview-image-fallback">RSS</div>}
                <div>
                  <strong>{item.title}</strong>
                  <span>{formatPreviewDate(item.publishedAt) ?? item.link ?? "RSS item"}</span>
                  <p>{getSummaryExcerpt(item.summary)}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
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
            <select
              value={externalType}
              onChange={(event) => {
                setExternalType(event.target.value as "web_url" | "rss_feed");
                setExternalRssPreview(emptyRssPreview);
              }}
            >
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
            <input
              value={externalUrl}
              onChange={(event) => {
                setExternalUrl(event.target.value);
                setExternalRssPreview(emptyRssPreview);
              }}
              placeholder={externalType === "rss_feed" ? "https://example.com/feed.xml" : "https://example.com"}
            />
          </label>
          {externalType === "web_url" ? (
            <fieldset className="operator-duration-options">
              <legend>Playback Mode</legend>
              <label>
                <input
                  checked={externalWebUrlPlaybackMode !== "persistent"}
                  name="external-web-url-playback-mode"
                  onChange={() => setExternalWebUrlPlaybackMode("timed")}
                  type="radio"
                />
                Timed playback
              </label>
              <label>
                <input
                  checked={externalWebUrlPlaybackMode === "persistent"}
                  disabled={externalWebUrlRenderMode === "browser"}
                  name="external-web-url-playback-mode"
                  onChange={() => setExternalWebUrlPlaybackMode("persistent")}
                  type="radio"
                />
                Persistent until schedule changes
              </label>
              {externalWebUrlRenderMode === "browser" ? (
                <small>Persistent playback currently uses Embedded iframe mode.</small>
              ) : null}
            </fieldset>
          ) : null}
          {externalType === "rss_feed" || externalWebUrlPlaybackMode !== "persistent" ? (
            <label>
              {externalType === "rss_feed" ? "Duration per item" : "Duration"}
              <input
                min={1}
                type="number"
                value={externalDuration}
                onChange={(event) => setExternalDuration(Math.max(Number(event.target.value), 1))}
              />
            </label>
          ) : null}
          {externalType === "rss_feed" ? (
            <label>
              Max items
              <input
                min={1}
                max={20}
                type="number"
                value={externalMaxItems}
                onChange={(event) => {
                  setExternalMaxItems(Math.max(Math.min(Number(event.target.value), 20), 1));
                  setExternalRssPreview(emptyRssPreview);
                }}
              />
              <small>The server resolves RSS into concrete player cards. The Player never fetches the feed.</small>
            </label>
          ) : null}
          {externalType === "rss_feed" ? renderRssStyleEditor(externalRssStyle, setExternalRssStyle) : null}
          {externalType === "web_url" ? (
            <label>
              Render mode
              <select
                value={externalWebUrlRenderMode}
                onChange={(event) => {
                  const mode = event.target.value as "iframe" | "browser";
                  setExternalWebUrlRenderMode(mode);

                  if (mode === "browser") {
                    setExternalWebUrlPlaybackMode("timed");
                  }
                }}
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
          {externalType === "rss_feed" ? (
            <div className="rss-preview-actions">
              <button
                disabled={isBusy || externalRssPreview.status === "loading" || !externalUrl.trim()}
                onClick={() => void previewRssFeed(externalUrl, externalMaxItems, setExternalRssPreview)}
                type="button"
              >
                Preview feed
              </button>
              {renderRssPreview(externalRssPreview, externalRssStyle)}
            </div>
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
              {editingItemId === item.mediaId && (item.type === "web_url" || item.type === "rss_feed") ? (
                <div className="media-card-editor">
                  <label>
                    Title
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                  </label>
                  <label>
                    URL
                    <input
                      value={editUrl}
                      onChange={(event) => {
                        setEditUrl(event.target.value);
                        setEditRssPreview(emptyRssPreview);
                      }}
                    />
                  </label>
                  {item.type === "web_url" ? (
                    <fieldset className="operator-duration-options">
                      <legend>Playback Mode</legend>
                      <label>
                        <input
                          checked={editWebUrlPlaybackMode !== "persistent"}
                          name={`edit-web-url-playback-mode-${item.mediaId}`}
                          onChange={() => setEditWebUrlPlaybackMode("timed")}
                          type="radio"
                        />
                        Timed playback
                      </label>
                      <label>
                        <input
                          checked={editWebUrlPlaybackMode === "persistent"}
                          disabled={editWebUrlRenderMode === "browser"}
                          name={`edit-web-url-playback-mode-${item.mediaId}`}
                          onChange={() => setEditWebUrlPlaybackMode("persistent")}
                          type="radio"
                        />
                        Persistent until schedule changes
                      </label>
                      {editWebUrlRenderMode === "browser" ? (
                        <small>Persistent playback currently uses Embedded iframe mode.</small>
                      ) : null}
                    </fieldset>
                  ) : null}
                  {item.type === "rss_feed" || editWebUrlPlaybackMode !== "persistent" ? (
                    <label>
                      {item.type === "rss_feed" ? "Duration per item" : "Duration"}
                      <input
                        min={1}
                        type="number"
                        value={editDuration}
                        onChange={(event) => setEditDuration(Math.max(Number(event.target.value), 1))}
                      />
                    </label>
                  ) : null}
                  {item.type === "rss_feed" ? (
                    <>
                      <label>
                        Max items
                        <input
                          min={1}
                          max={20}
                          type="number"
                          value={editMaxItems}
                          onChange={(event) => {
                            setEditMaxItems(Math.max(Math.min(Number(event.target.value), 20), 1));
                            setEditRssPreview(emptyRssPreview);
                          }}
                        />
                        <small>The server resolves RSS into concrete player cards.</small>
                      </label>
                      {renderRssStyleEditor(editRssStyle, setEditRssStyle)}
                    </>
                  ) : (
                    <>
                      <label>
                        Render mode
                        <select
                          value={editWebUrlRenderMode}
                          onChange={(event) => {
                            const mode = event.target.value as "iframe" | "browser";
                            setEditWebUrlRenderMode(mode);

                            if (mode === "browser") {
                              setEditWebUrlPlaybackMode("timed");
                            }
                          }}
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
                  {item.type === "rss_feed" ? (
                    <div className="rss-preview-actions">
                      <button
                        disabled={isBusy || editRssPreview.status === "loading" || !editUrl.trim()}
                        onClick={() => void previewRssFeed(editUrl, editMaxItems, setEditRssPreview)}
                        type="button"
                      >
                        Preview feed
                      </button>
                      {renderRssPreview(editRssPreview, editRssStyle)}
                    </div>
                  ) : null}
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
                    {item.type === "video" ? (
                      <>
                        <span className={`media-processing-badge ${getVideoProcessingStatus(item) ?? "ready"}`}>
                          {getVideoProcessingLabel(item)}
                        </span>
                        {item.processingStatus && item.processingStatus !== "ready" && item.processingStatus !== "failed" ? (
                          <p>{getVideoProcessingLabel(item)}</p>
                        ) : null}
                        {item.processingStatus === "failed" ? (
                          <>
                            <p className="media-processing-error">
                              {item.processingError ?? "Normalization failed."}
                            </p>
                            <button disabled={isBusy} onClick={() => void retryNormalization(item)} type="button">
                              Retry normalization
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {item.type === "web_url" ? (
                      <>
                        <p>Playback: {item.webUrlPlaybackMode === "persistent" ? "Persistent until schedule changes" : "Timed playback"}</p>
                        <p>Render mode: {item.webUrlRenderMode ?? "iframe"}</p>
                      </>
                    ) : null}
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
