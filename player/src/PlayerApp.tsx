import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Schedule, ScheduleItem, ThemeRegion } from "./schedule/types";

const reloadIntervalMs = 30_000;
const mediaProbeTimeoutMs = 2_500;
const appliedScheduleSignatureKey = "narrowcasting:last-applied-schedule-signature";
const scheduleReloadCountKey = "narrowcasting:schedule-reload-count";

interface ScheduleDebugInfo {
  enabled: boolean;
  lastPollAt: string | null;
  currentSignature: string | null;
  fetchedSignature: string | null;
  itemCount: number | null;
  reloadTriggered: boolean;
  reloadCount: number;
  status: string;
}

function getViewportSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const schedule = value as Partial<Schedule>;
  return (
    typeof schedule.version === "number" &&
    typeof schedule.updatedAt === "string" &&
    Array.isArray(schedule.items)
  );
}

function getScheduleSignature(schedule: Schedule) {
  return JSON.stringify(schedule);
}

function getShortSignature(signature: string | null) {
  if (!signature) {
    return "none";
  }

  let hash = 2166136261;

  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getItemKey(
  item: ScheduleItem | null,
  schedule: Schedule | null,
  activeIndex: number,
  playbackEpoch: number,
  playbackSessionKey: number
) {
  if (!item || !schedule) {
    return "no-item";
  }

  const file = item.type === "image" || item.type === "video" ? item.file : item.title;
  return `${playbackSessionKey}-${schedule.version}-${schedule.updatedAt}-${activeIndex}-${playbackEpoch}-${item.id}-${file}`;
}

function getMediaUrl(file: string) {
  return `/media/${encodeURIComponent(file)}`;
}

function probeImage(file: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), mediaProbeTimeoutMs);

    image.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    image.src = `${getMediaUrl(file)}?probe=${Date.now()}`;
  });
}

function probeVideo(file: string) {
  return new Promise<boolean>((resolve) => {
    const video = document.createElement("video");
    const timer = window.setTimeout(() => resolve(false), mediaProbeTimeoutMs);

    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    video.preload = "metadata";
    video.muted = true;
    video.src = `${getMediaUrl(file)}?probe=${Date.now()}`;
    video.load();
  });
}

async function probeFirstMediaItem(schedule: Schedule) {
  const firstMediaItem = schedule.items.find((item) => item.type === "image" || item.type === "video");

  if (!firstMediaItem) {
    return true;
  }

  if (firstMediaItem.type === "image") {
    return probeImage(firstMediaItem.file);
  }

  return probeVideo(firstMediaItem.file);
}

function readStoredScheduleSignature() {
  try {
    return window.sessionStorage.getItem(appliedScheduleSignatureKey);
  } catch {
    return null;
  }
}

function writeStoredScheduleSignature(signature: string) {
  try {
    window.sessionStorage.setItem(appliedScheduleSignatureKey, signature);
  } catch {
    // Session storage can be unavailable in hardened browser profiles.
  }
}

function readScheduleReloadCount() {
  try {
    return Number(window.sessionStorage.getItem(scheduleReloadCountKey) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeScheduleReloadCount(count: number) {
  try {
    window.sessionStorage.setItem(scheduleReloadCountKey, String(count));
  } catch {
    // Session storage can be unavailable in hardened browser profiles.
  }
}

function isDebugEnabled() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

function hasReloadMarker() {
  return new URLSearchParams(window.location.search).has("reload");
}

function reloadPlayerForSchedule(signature: string, debugEnabled: boolean) {
  writeStoredScheduleSignature(signature);
  writeScheduleReloadCount(readScheduleReloadCount() + 1);
  window.location.href = `/player?reload=${Date.now()}${debugEnabled ? "&debug=1" : ""}`;
}

function getRegionFrameStyle(region: ThemeRegion): CSSProperties {
  return {
    left: `${region.x}px`,
    top: `${region.y}px`,
    width: `${region.width}px`,
    height: `${region.height}px`,
    opacity: region.opacity ?? 1,
    borderRadius: `${region.cornerRadius ?? 0}px`
  };
}

function getObjectFit(region: ThemeRegion): CSSProperties["objectFit"] {
  if (region.objectFit === "stretch") {
    return "fill";
  }

  if (region.objectFit === "center") {
    return "none";
  }

  return region.objectFit ?? "contain";
}

function formatClock(date: Date, format: ThemeRegion["clockFormat"] = "HH:mm") {
  const twoDigit = (value: number) => String(value).padStart(2, "0");
  const hours = twoDigit(date.getHours());
  const minutes = twoDigit(date.getMinutes());
  const seconds = twoDigit(date.getSeconds());
  const day = twoDigit(date.getDate());
  const month = twoDigit(date.getMonth() + 1);
  const year = date.getFullYear();

  if (format === "HH:mm:ss") {
    return `${hours}:${minutes}:${seconds}`;
  }

  if (format === "dd-MM-yyyy HH:mm") {
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }

  return `${hours}:${minutes}`;
}

export function PlayerApp() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackEpoch, setPlaybackEpoch] = useState(0);
  const [playbackSessionKey, setPlaybackSessionKey] = useState(0);
  const [missingItemMessage, setMissingItemMessage] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [debugInfo, setDebugInfo] = useState<ScheduleDebugInfo>(() => ({
    enabled: isDebugEnabled(),
    lastPollAt: null,
    currentSignature: null,
    fetchedSignature: null,
    itemCount: null,
    reloadTriggered: false,
    reloadCount: readScheduleReloadCount(),
    status: "waiting"
  }));
  const playbackSessionKeyRef = useRef(0);
  const failureTimerRef = useRef<number | null>(null);

  function clearFailureTimer() {
    if (failureTimerRef.current !== null) {
      window.clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let currentSignature: string | null = null;

    async function loadSchedule() {
      const polledAt = new Date().toLocaleTimeString();

      try {
        const response = await fetch(`/data/schedule.json?t=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache"
          }
        });

        if (!response.ok) {
          if (!cancelled) {
            setSchedule((existingSchedule) => existingSchedule);
            setDebugInfo((info) => ({
              ...info,
              lastPollAt: polledAt,
              fetchedSignature: null,
              reloadTriggered: false,
              status: `fetch failed: HTTP ${response.status}`
            }));
          }
          return;
        }

        const body: unknown = await response.json();

        if (isSchedule(body) && !cancelled) {
          const nextSignature = getScheduleSignature(body);
          const storedSignature = readStoredScheduleSignature();
          const debugEnabled = isDebugEnabled();
          const shouldReload =
            currentSignature !== null &&
            nextSignature !== currentSignature &&
            !(storedSignature === nextSignature && hasReloadMarker());

          setDebugInfo((info) => ({
            ...info,
            lastPollAt: polledAt,
            currentSignature,
            fetchedSignature: nextSignature,
            itemCount: body.items.length,
            reloadTriggered: shouldReload,
            reloadCount: readScheduleReloadCount(),
            status: shouldReload
              ? "signature changed; reloading"
              : nextSignature === currentSignature
                ? "unchanged"
                : "signature changed; applying"
          }));

          if (shouldReload) {
            console.info("schedule signature changed; reloading player document", {
              oldSignature: currentSignature,
              newSignature: nextSignature,
              oldShortSignature: getShortSignature(currentSignature),
              newShortSignature: getShortSignature(nextSignature),
              itemCount: body.items.length
            });
            reloadPlayerForSchedule(nextSignature, debugEnabled);
            return;
          }

          if (nextSignature !== currentSignature) {
            await probeFirstMediaItem(body);

            if (cancelled) {
              return;
            }

            console.info("schedule reload applied", {
              oldSignature: currentSignature,
              newSignature: nextSignature,
              oldShortSignature: getShortSignature(currentSignature),
              newShortSignature: getShortSignature(nextSignature),
              itemCount: body.items.length
            });
            currentSignature = nextSignature;
            writeStoredScheduleSignature(nextSignature);
            setDebugInfo((info) => ({
              ...info,
              currentSignature: nextSignature,
              fetchedSignature: nextSignature,
              itemCount: body.items.length,
              reloadTriggered: false,
              reloadCount: readScheduleReloadCount(),
              status: "applied"
            }));
            clearFailureTimer();
            setSchedule(body);
            setActiveIndex(0);
            setPlaybackEpoch((epoch) => epoch + 1);
            setPlaybackSessionKey((key) => {
              const nextKey = key + 1;
              playbackSessionKeyRef.current = nextKey;
              return nextKey;
            });
            setMissingItemMessage(null);
          }

          setLastLoadedAt(new Date().toLocaleTimeString());
        } else if (!cancelled) {
          setDebugInfo((info) => ({
            ...info,
            lastPollAt: polledAt,
            fetchedSignature: null,
            reloadTriggered: false,
            status: "invalid schedule"
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setSchedule((existingSchedule) => existingSchedule);
          setDebugInfo((info) => ({
            ...info,
            lastPollAt: polledAt,
            fetchedSignature: null,
            reloadTriggered: false,
            status: error instanceof Error ? `fetch error: ${error.message}` : "fetch error"
          }));
        }
      }
    }

    void loadSchedule();
    const reloadTimer = window.setInterval(() => {
      void loadSchedule();
    }, reloadIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(reloadTimer);
      clearFailureTimer();
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      setViewportSize(getViewportSize());
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeItem = useMemo(() => {
    if (!schedule || schedule.items.length === 0) {
      return null;
    }

    return schedule.items[activeIndex % schedule.items.length];
  }, [activeIndex, schedule]);

  const advanceToNextItem = useCallback((sessionKey = playbackSessionKeyRef.current) => {
    if (sessionKey !== playbackSessionKeyRef.current) {
      return;
    }

    if (!schedule || schedule.items.length === 0) {
      return;
    }

    if (schedule.items.length === 1) {
      setPlaybackEpoch((epoch) => epoch + 1);
      return;
    }

    setActiveIndex((index) => (index + 1) % schedule.items.length);
  }, [schedule]);

  const handleActiveItemFailure = useCallback(
    (sessionKey: number, message: string) => {
      if (sessionKey !== playbackSessionKeyRef.current) {
        return;
      }

      clearFailureTimer();
      setMissingItemMessage(message);

      if (!schedule || schedule.items.length === 0) {
        return;
      }

      if (schedule.items.length === 1) {
        return;
      }

      failureTimerRef.current = window.setTimeout(() => {
        if (sessionKey !== playbackSessionKeyRef.current) {
          return;
        }

        setMissingItemMessage(null);
        advanceToNextItem(sessionKey);
      }, 300);
    },
    [advanceToNextItem, schedule]
  );

  function renderActiveItem(className: string) {
    if (!activeItem) {
      return null;
    }

    const sessionKey = playbackSessionKey;

    if (activeItem.type === "image") {
      return (
        <>
          <img
            alt=""
            className={className}
            key={getItemKey(activeItem, schedule, activeIndex, playbackEpoch, playbackSessionKey)}
            onLoad={() => {
              if (sessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              clearFailureTimer();
              setMissingItemMessage(null);
            }}
            onError={(event) => {
              if (sessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              event.currentTarget.dataset.missing = "true";
              handleActiveItemFailure(sessionKey, `Media unavailable: ${activeItem.file}`);
            }}
            src={getMediaUrl(activeItem.file)}
          />
          <p className="missing-media-message">{missingItemMessage ?? `Media unavailable: ${activeItem.file}`}</p>
        </>
      );
    }

    if (activeItem.type === "video") {
      return (
        <>
          <video
            autoPlay
            className={className}
            key={getItemKey(activeItem, schedule, activeIndex, playbackEpoch, playbackSessionKey)}
            muted
            onCanPlay={(event) => {
              if (sessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              clearFailureTimer();
              setMissingItemMessage(null);
              void event.currentTarget.play().catch(() => {
                advanceToNextItem(sessionKey);
              });
            }}
            onEnded={() => {
              advanceToNextItem(sessionKey);
            }}
            onError={(event) => {
              if (sessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              event.currentTarget.dataset.missing = "true";
              handleActiveItemFailure(sessionKey, `Media unavailable: ${activeItem.file}`);
            }}
            playsInline
            preload="auto"
            src={getMediaUrl(activeItem.file)}
          />
          <p className="missing-media-message">{missingItemMessage ?? `Media unavailable: ${activeItem.file}`}</p>
        </>
      );
    }

    return <h1>{activeItem.title}</h1>;
  }

  function renderDebugOverlay() {
    if (!debugInfo.enabled) {
      return null;
    }

    return (
      <aside className="schedule-debug-overlay" aria-label="Schedule debug">
        <strong>Schedule debug</strong>
        <span>Poll: {debugInfo.lastPollAt ?? "never"}</span>
        <span>Current: {getShortSignature(debugInfo.currentSignature)}</span>
        <span>Fetched: {getShortSignature(debugInfo.fetchedSignature)}</span>
        <span>Items: {debugInfo.itemCount ?? "-"}</span>
        <span>Reload: {debugInfo.reloadTriggered ? "yes" : "no"}</span>
        <span>Reload count: {debugInfo.reloadCount}</span>
        <span>Status: {debugInfo.status}</span>
      </aside>
    );
  }

  function renderStaticImageRegion(region: ThemeRegion, className: string) {
    if (region.visible === false || !region.file) {
      return null;
    }

    return (
      <div className={className} key={region.id} style={getRegionFrameStyle(region)}>
        <img
          alt=""
          className="theme-static-image"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={getMediaUrl(region.file)}
          style={{
            objectFit: getObjectFit(region)
          }}
        />
      </div>
    );
  }

  function renderTextRegion(region: ThemeRegion) {
    if (region.visible === false) {
      return null;
    }

    return (
      <div
        className="theme-text-region"
        key={region.id}
        style={{
          ...getRegionFrameStyle(region),
          alignItems: "center",
          backgroundColor: region.backgroundColor ?? "transparent",
          color: region.textColor ?? "#ffffff",
          display: "flex",
          fontFamily: region.font ?? "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: `${region.fontSize ?? 48}px`,
          fontStyle: region.italic ? "italic" : "normal",
          fontWeight: region.bold ? 700 : 400,
          justifyContent:
            region.align === "right" ? "flex-end" : region.align === "left" ? "flex-start" : "center",
          padding: `${region.padding ?? 0}px`,
          textAlign: region.align ?? "center"
        }}
      >
        {region.text ?? ""}
      </div>
    );
  }

  function renderClockRegion(region: ThemeRegion) {
    if (region.visible === false) {
      return null;
    }

    return (
      <div
        className="theme-clock-region"
        key={region.id}
        style={{
          ...getRegionFrameStyle(region),
          alignItems: "center",
          backgroundColor: region.backgroundColor ?? "transparent",
          color: region.textColor ?? "#ffffff",
          display: "flex",
          fontFamily: region.font ?? "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: `${region.fontSize ?? 64}px`,
          fontStyle: region.italic ? "italic" : "normal",
          fontWeight: region.bold ? 700 : 400,
          justifyContent:
            region.align === "right" ? "flex-end" : region.align === "left" ? "flex-start" : "center",
          padding: `${region.padding ?? 0}px`,
          textAlign: region.align ?? "center"
        }}
      >
        {formatClock(clockNow, region.clockFormat)}
      </div>
    );
  }

  useEffect(() => {
    if (!activeItem || !schedule || typeof activeItem.duration !== "number") {
      return;
    }

    if (schedule.items.length <= 1 && activeItem.type !== "video") {
      return;
    }

    const durationMs = Math.max(activeItem.duration, 1) * 1000;
    const rotationTimer = window.setTimeout(() => {
      advanceToNextItem(playbackSessionKey);
    }, durationMs);

    return () => {
      window.clearTimeout(rotationTimer);
    };
  }, [activeItem, advanceToNextItem, playbackSessionKey, schedule]);

  if (!activeItem) {
    const hasEmptyPlaylist = schedule !== null && schedule.items.length === 0;

    return (
      <main className="player-shell">
        <section className="playback-surface" aria-label="Local playlist playback">
          <p className="status-label">
            {hasEmptyPlaylist ? `Local schedule version ${schedule.version}` : "Waiting for local schedule"}
          </p>
          <h1>{hasEmptyPlaylist ? "Playlist is empty" : "Waiting for local schedule"}</h1>
        </section>
        <footer className="status-bar">
          <span>Playback: {hasEmptyPlaylist ? "empty playlist" : "waiting"}</span>
          <span>Schedule: {hasEmptyPlaylist ? `version ${schedule.version}` : "not cached"}</span>
          <span>Reload: every 30s</span>
        </footer>
        {renderDebugOverlay()}
      </main>
    );
  }

  const theme = schedule?.theme;
  const programRegion = theme?.regions.find((region) => region.type === "program");

  if (theme) {
    const scale = Math.min(
      viewportSize.width / theme.canvasWidth,
      viewportSize.height / theme.canvasHeight
    );
    const imageRegions = theme.regions.filter((region) => region.type === "image");
    const logoRegions = theme.regions.filter((region) => region.type === "logo");
    const textRegions = theme.regions.filter((region) => region.type === "text");
    const clockRegions = theme.regions.filter((region) => region.type === "clock");

    return (
      <main className="player-shell themed-player-shell">
        <section
          className="theme-viewport"
          style={{
            backgroundColor: theme.backgroundColor
          }}
          aria-label="Local themed playlist playback"
        >
          <div
            className="theme-canvas"
            style={{
              width: `${theme.canvasWidth}px`,
              height: `${theme.canvasHeight}px`,
              backgroundColor: theme.backgroundColor,
              transform: `scale(${Number.isFinite(scale) ? scale : 1})`
            }}
          >
            {imageRegions.map((region) => renderStaticImageRegion(region, "theme-static-region"))}
            {programRegion && programRegion.visible !== false ? (
              <div
                className="theme-program-region"
                key={`program-region-${playbackSessionKey}`}
                style={getRegionFrameStyle(programRegion)}
              >
                {renderActiveItem("themed-media")}
              </div>
            ) : null}
            {logoRegions.map((region) => renderStaticImageRegion(region, "theme-logo-region"))}
            {textRegions.map((region) => renderTextRegion(region))}
            {clockRegions.map((region) => renderClockRegion(region))}
          </div>
        </section>
        <footer className="status-bar">
          <span>Playback: local</span>
          <span>Theme: {theme.name}</span>
          <span>
            Item {activeIndex + 1} / {schedule?.items.length}
          </span>
          <span>Type: {activeItem.type}</span>
          <span>Loaded: {lastLoadedAt ?? "unknown"}</span>
        </footer>
        {renderDebugOverlay()}
      </main>
    );
  }

  return (
    <main className="player-shell">
      <section
        className={`playback-surface ${
          activeItem.type === "image" || activeItem.type === "video" ? "image-surface" : ""
        }`}
        aria-label="Local playlist playback"
      >
        <p className="status-label">Local schedule version {schedule?.version}</p>
        {renderActiveItem(activeItem.type === "image" ? "media-image" : "media-video")}
      </section>
      <footer className="status-bar">
        <span>Playback: local</span>
        <span>
          Item {activeIndex + 1} / {schedule?.items.length}
        </span>
        <span>Type: {activeItem.type}</span>
        <span>Duration: {activeItem.duration}s</span>
        <span>Loaded: {lastLoadedAt ?? "unknown"}</span>
      </footer>
      {renderDebugOverlay()}
    </main>
  );
}
