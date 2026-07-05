import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Schedule, ScheduleItem, ThemeRegion } from "./schedule/types";

const reloadIntervalMs = 30_000;
const mediaProbeTimeoutMs = 2_500;
const appliedScheduleSignatureKey = "narrowcasting:last-applied-schedule-signature";
const scheduleReloadCountKey = "narrowcasting:schedule-reload-count";
const playerIdKey = "narrowcasting:player-id";
const screenIdKey = "narrowcasting:screen-id";
const deviceSecretKey = "narrowcasting:device-secret";
const serverUrlKey = "narrowcasting:server-url";
const browserRendererResumeKey = "narrowcasting:browser-renderer-resume";
const browserRendererControlUrl = "http://127.0.0.1:4175/browser-renderer/render";
const browserRendererPersistentAllItemsSeconds = 24 * 60 * 60;
const playerVersion = "phase-1";
const heartbeatIntervalMs = 10_000;
const heartbeatFailureBackoffMs = 60_000;

declare global {
  interface Window {
    __narrowcastingPlayerHealth?: {
      activeIndex: number;
      assignmentStatus: string | null;
      itemCount: number;
      lastRenderAt: number;
      lastRenderIso: string;
      scheduleVersion: number | null;
      state: string;
    };
  }
}

interface RegistrationState {
  playerId: string;
  screenId: string | null;
  deviceSecret: string | null;
  serverUrl: string | null;
  status: "approved" | "discovering" | "pending" | "offline" | "error";
  message: string;
  hostname: string;
}

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

interface VideoDebugEvent {
  time: string;
  event: string;
  itemId: string;
  itemIndex: number;
  cycleId: number;
  sessionKey: number;
  epoch: number;
  videoKey: string;
  src: string;
  regionId: string;
  activeVisible: boolean;
  refReady: boolean;
  renderedSrcAttribute: string | null;
  currentSrc: string | null;
  hasSourceChildren: boolean;
  loadCalled: boolean;
  playCalled: boolean;
  playSkippedReason?: string;
  currentTime: number | null;
  paused: boolean | null;
  ended: boolean | null;
  readyState: number | null;
  networkState: number | null;
  note?: string;
}

interface PlaybackDebugEvent {
  time: string;
  event: string;
  reason?: string;
  itemId: string | null;
  itemType: string | null;
  itemIndex: number;
  itemCount: number;
  duration: number | null;
  computedDurationMs?: number | null;
  cycleId: number;
  epoch: number;
  playbackSessionKey: number;
  playbackSessionKeyRef: number;
  scheduledSessionKey?: number;
  nextIndex?: number;
  note?: string;
}

interface BrowserRendererState {
  itemKey: string | null;
  message: string;
  status: "idle" | "starting" | "active" | "failed";
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

  const file =
    item.type === "image" || item.type === "video"
      ? item.file
      : item.type === "web_url"
        ? item.url
        : item.title;
  return `${playbackSessionKey}-${schedule.version}-${schedule.updatedAt}-${activeIndex}-${playbackEpoch}-${item.id}-${file}`;
}

function getWebUrlRenderData(item: ScheduleItem | null) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as ScheduleItem & {
    renderType?: unknown;
    title?: unknown;
    url?: unknown;
    webUrlRenderMode?: unknown;
    browserActions?: unknown;
  };

  if (candidate.type !== "web_url" && candidate.renderType !== "web_url") {
    return null;
  }

  return {
    id: candidate.id,
    itemType: candidate.type,
    renderType: typeof candidate.renderType === "string" ? candidate.renderType : null,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    url: typeof candidate.url === "string" ? candidate.url : "",
    webUrlRenderMode: candidate.webUrlRenderMode === "browser" ? "browser" : "iframe",
    browserActions: Array.isArray(candidate.browserActions) ? candidate.browserActions : []
  };
}

function isRenderableWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getBrowserRendererSessionSignature(item: ScheduleItem | null) {
  const webUrlItem = getWebUrlRenderData(item);

  if (!webUrlItem || webUrlItem.webUrlRenderMode !== "browser") {
    return null;
  }

  return JSON.stringify({
    browserActions: webUrlItem.browserActions,
    mode: webUrlItem.webUrlRenderMode,
    type: "web_url",
    url: webUrlItem.url
  });
}

function readBrowserRendererResume() {
  const value = readLocalStorage(browserRendererResumeKey);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      expiresAt?: unknown;
      nextIndex?: unknown;
      resumeAfter?: unknown;
      sessionSignature?: unknown;
    };

    if (
      typeof parsed.sessionSignature === "string" &&
      typeof parsed.nextIndex === "number" &&
      typeof parsed.resumeAfter === "number" &&
      typeof parsed.expiresAt === "number"
    ) {
      return parsed as { expiresAt: number; nextIndex: number; resumeAfter: number; sessionSignature: string };
    }
  } catch {
    // Invalid resume markers are ignored and replaced by the next browser handoff.
  }

  removeLocalStorage(browserRendererResumeKey);
  return null;
}

function writeBrowserRendererResume(sessionSignature: string, durationMs: number, nextIndex: number) {
  const resumeAfter = Date.now() + durationMs;
  writeLocalStorage(
    browserRendererResumeKey,
    JSON.stringify({
      expiresAt: resumeAfter + 120_000,
      nextIndex,
      resumeAfter,
      sessionSignature
    })
  );
}

function getBrowserRendererRun(schedule: Schedule, activeIndex: number) {
  const activeItem = schedule.items[activeIndex % schedule.items.length];
  const activeSignature = getBrowserRendererSessionSignature(activeItem);

  if (!activeSignature) {
    return null;
  }

  let durationSeconds = 0;
  let itemCount = 0;

  for (let offset = 0; offset < schedule.items.length; offset += 1) {
    const index = (activeIndex + offset) % schedule.items.length;
    const item = schedule.items[index];

    if (getBrowserRendererSessionSignature(item) !== activeSignature) {
      break;
    }

    durationSeconds += Math.max(typeof item.duration === "number" ? item.duration : 10, 1);
    itemCount += 1;
  }

  const allItemsSameSession = itemCount === schedule.items.length;

  return {
    allItemsSameSession,
    durationMs: (allItemsSameSession ? browserRendererPersistentAllItemsSeconds : durationSeconds) * 1000,
    itemCount,
    nextIndex: (activeIndex + itemCount) % schedule.items.length,
    sessionSignature: activeSignature
  };
}

function getMediaUrl(file: string) {
  return `/media/${encodeURIComponent(file)}`;
}

function getVideoElementState(video: HTMLVideoElement | null) {
  if (!video) {
    return {
      currentTime: null,
      paused: null,
      ended: null,
      readyState: null,
      networkState: null
    };
  }

  return {
    currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : null,
    paused: video.paused,
    ended: video.ended,
    readyState: video.readyState,
    networkState: video.networkState
  };
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

function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage may be unavailable in hardened browser profiles.
  }
}

function removeLocalStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local storage may be unavailable in hardened browser profiles.
  }
}

function getOrCreatePlayerId() {
  const existingPlayerId = readLocalStorage(playerIdKey);

  if (existingPlayerId) {
    return existingPlayerId;
  }

  const playerId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeLocalStorage(playerIdKey, playerId);
  return playerId;
}

function isInvalidDeviceIdentity(status: number, code: unknown) {
  return (
    (status === 404 && (code === "SCREEN_NOT_FOUND" || code === "UNKNOWN_SCREEN")) ||
    ((status === 401 || status === 403) &&
      (code === "INVALID_DEVICE_SECRET" || code === "DEVICE_AUTH_FAILED" || code === "DEVICE_AUTH_REQUIRED"))
  );
}

function normalizeServerUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeServerUrl(serverUrl: string | null) {
  const normalizedUrl = normalizeServerUrl(serverUrl);

  if (!normalizedUrl) {
    return null;
  }

  try {
    const response = await fetchWithTimeout(`${normalizedUrl}/api/status`, {}, 1200);

    if (!response.ok) {
      return null;
    }

    const body = await response.json();

    if (body?.application === "Narrowcasting Server") {
      return normalizedUrl;
    }
  } catch {
    return null;
  }

  return null;
}

async function discoverServerUrl(knownUrl: string | null) {
  const knownServerUrl = await probeServerUrl(knownUrl);

  if (knownServerUrl) {
    return knownServerUrl;
  }

  const mdnsServerUrl = await probeServerUrl("http://narrowcasting.local:3000");

  if (mdnsServerUrl) {
    return mdnsServerUrl;
  }

  try {
    const discoveryUrl = knownUrl
      ? `/api/discovery?known=${encodeURIComponent(knownUrl)}`
      : "/api/discovery";
    const response = await fetchWithTimeout(discoveryUrl, {}, 10_000);

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    return normalizeServerUrl(body?.serverUrl ?? null);
  } catch {
    return null;
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

async function persistPlayerRegistration(
  screenId: string,
  playerId: string,
  serverUrl: string,
  deviceSecret: string | null
) {
  try {
    await fetch("/api/player-registration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        screenId,
        playerId,
        serverUrl,
        deviceSecret
      })
    });
  } catch {
    // Development Vite server may not expose this helper. Browser registration still works.
  }
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

interface InstrumentedVideoProps {
  activeIndex: number;
  className: string;
  debugEnabled: boolean;
  item: Extract<ScheduleItem, { type: "video" }>;
  activeVisible: boolean;
  onAdvance: (sessionKey: number, reason: string) => void;
  onDebugEvent: (event: VideoDebugEvent) => void;
  onFailure: (sessionKey: number, message: string) => void;
  playbackEpoch: number;
  programCycleId: number;
  regionId: string;
  sessionKey: number;
  src: string;
  videoKey: string;
}

function InstrumentedVideo({
  activeIndex,
  className,
  debugEnabled,
  item,
  activeVisible,
  onAdvance,
  onDebugEvent,
  onFailure,
  playbackEpoch,
  programCycleId,
  regionId,
  sessionKey,
  src,
  videoKey
}: InstrumentedVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clipTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);

  function clearVideoClipTimer() {
    if (clipTimerRef.current !== null) {
      window.clearTimeout(clipTimerRef.current);
      clipTimerRef.current = null;
    }
  }

  function clearVideoWatchdog() {
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }

  function clearVideoTimers() {
    clearVideoClipTimer();
    clearVideoWatchdog();
  }

  const emit = useCallback(
    (
      event: string,
      note?: string,
      video: HTMLVideoElement | null = videoRef.current,
      options: Partial<
        Pick<VideoDebugEvent, "loadCalled" | "playCalled" | "playSkippedReason">
      > = {}
    ) => {
      const debugEvent: VideoDebugEvent = {
        time: new Date().toLocaleTimeString(),
        event,
        itemId: item.id,
        itemIndex: activeIndex,
        cycleId: programCycleId,
        sessionKey,
        epoch: playbackEpoch,
        videoKey,
        src,
        regionId,
        activeVisible,
        refReady: video !== null,
        renderedSrcAttribute: video?.getAttribute("src") ?? null,
        currentSrc: video?.currentSrc || null,
        hasSourceChildren: video ? video.querySelectorAll("source").length > 0 : false,
        loadCalled: options.loadCalled ?? false,
        playCalled: options.playCalled ?? false,
        playSkippedReason: options.playSkippedReason,
        ...getVideoElementState(video),
        note
      };

      if (debugEnabled) {
        console.info("video lifecycle", debugEvent);
      }

      onDebugEvent(debugEvent);
    },
    [
      activeIndex,
      activeVisible,
      debugEnabled,
      item.id,
      onDebugEvent,
      playbackEpoch,
      programCycleId,
      regionId,
      sessionKey,
      src,
      videoKey
    ]
  );

  useEffect(() => {
    emit("mount", "component mounted; no explicit load/play in mount path", videoRef.current, {
      playSkippedReason: "waiting for canplay handler"
    });

    emit("init effect start", "checking rendered DOM video element", videoRef.current, {
      playSkippedReason: "diagnostic snapshot before browser media events"
    });

    if (!videoRef.current) {
      emit("init early return", "video ref is null after mount", null, {
        playSkippedReason: "video ref missing"
      });

      return () => {
        emit("unmount", "cleanup after null-ref init path", videoRef.current);
      };
    }

    emit("init dom snapshot", "direct src attribute is used; no <source> children", videoRef.current, {
      playSkippedReason: "waiting for canplay handler"
    });

    if (!activeVisible) {
      emit("init early return", "video is not active/visible", videoRef.current, {
        playSkippedReason: "video not active/visible"
      });

      return () => {
        emit("unmount", "cleanup after inactive/hidden init path", videoRef.current);
      };
    }

    try {
      videoRef.current.currentTime = 0;
    } catch {
      // Some browsers reject currentTime before metadata is available; load/play still follows.
    }

    videoRef.current.load();
    emit("mount load called", "reset currentTime then called load()", videoRef.current, {
      loadCalled: true,
      playSkippedReason: undefined
    });

    void videoRef.current
      .play()
      .then(() => {
        emit("mount play resolved", undefined, videoRef.current, {
          loadCalled: true,
          playCalled: true
        });
      })
      .catch((error: unknown) => {
        emit(
          "mount play rejected",
          error instanceof Error ? error.message : String(error),
          videoRef.current,
          {
            loadCalled: true,
            playCalled: true
          }
        );
      });

    const snapshotTimer = window.setTimeout(() => {
      emit("post-mount 250ms snapshot", "checking whether browser began media initialization", videoRef.current, {
        playSkippedReason: "waiting for canplay handler"
      });
    }, 250);

    const animationFrame = window.requestAnimationFrame(() => {
      emit("post-mount animation frame", "checking DOM state after paint", videoRef.current, {
        playSkippedReason: "waiting for canplay handler"
      });
    });

    return () => {
      clearVideoTimers();
      window.clearTimeout(snapshotTimer);
      window.cancelAnimationFrame(animationFrame);
      emit("unmount", "component cleanup", videoRef.current);
    };
  }, [activeVisible, emit]);

  return (
    <video
      autoPlay
      className={className}
      key={videoKey}
      muted
      onCanPlay={(event) => {
        emit("canplay", "play() called from canplay handler", event.currentTarget, {
          playCalled: true
        });
        void event.currentTarget
          .play()
          .then(() => {
            emit("play resolved", undefined, event.currentTarget, {
              playCalled: true
            });
          })
          .catch((error: unknown) => {
            emit(
              "play rejected",
              error instanceof Error ? error.message : String(error),
              event.currentTarget,
              {
                playCalled: true
              }
            );
            onAdvance(sessionKey, "video play rejected");
          });
      }}
      onEnded={(event) => {
        clearVideoTimers();
        emit("ended", undefined, event.currentTarget);
        onAdvance(sessionKey, "video ended");
      }}
      onError={(event) => {
        clearVideoTimers();
        event.currentTarget.dataset.missing = "true";
        emit("error", "media element error", event.currentTarget);
        onFailure(sessionKey, `Media unavailable: ${item.file}`);
      }}
      onLoadedMetadata={(event) => {
        emit("loadedmetadata", undefined, event.currentTarget);

        if (Number.isFinite(event.currentTarget.duration) && event.currentTarget.duration > 0) {
          clearVideoWatchdog();
          const watchdogMs = Math.ceil(event.currentTarget.duration * 1000) + 3000;
          emit("video watchdog scheduled", `duration ${event.currentTarget.duration}s + safety margin`, event.currentTarget);
          watchdogTimerRef.current = window.setTimeout(() => {
            emit("video watchdog fired", undefined, event.currentTarget);
            onAdvance(sessionKey, "video watchdog fired");
          }, watchdogMs);
        }
      }}
      onPause={(event) => {
        emit("pause", undefined, event.currentTarget);
      }}
      onPlay={(event) => {
        emit("play event", undefined, event.currentTarget);
      }}
      onPlaying={(event) => {
        emit("playing", undefined, event.currentTarget);

        if (item.durationMode === "clip" && typeof item.duration === "number") {
          clearVideoClipTimer();
          const clipDurationMs = Math.max(item.duration, 1) * 1000;
          emit("video clip timer scheduled", `explicit clip duration ${item.duration}s`, event.currentTarget);
          clipTimerRef.current = window.setTimeout(() => {
            emit("video clip timer fired", undefined, event.currentTarget);
            onAdvance(sessionKey, "video clip timer fired");
          }, clipDurationMs);
        }
      }}
      playsInline
      preload="auto"
      ref={videoRef}
      src={src}
    />
  );
}

export function PlayerApp() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackEpoch, setPlaybackEpoch] = useState(0);
  const [playbackSessionKey, setPlaybackSessionKey] = useState(0);
  const [programCycleId, setProgramCycleId] = useState(0);
  const [missingItemMessage, setMissingItemMessage] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [registration, setRegistration] = useState<RegistrationState>(() => {
    const screenId = readLocalStorage(screenIdKey);
    const deviceSecret = readLocalStorage(deviceSecretKey);

    return {
      playerId: getOrCreatePlayerId(),
      screenId,
      deviceSecret,
      serverUrl: readLocalStorage(serverUrlKey),
      status: screenId && deviceSecret ? "approved" : "discovering",
      message:
        screenId && deviceSecret
          ? "Screen already registered."
          : "Discovering server...",
      hostname: window.location.hostname || "unknown"
    };
  });
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
  const [browserRendererState, setBrowserRendererState] = useState<BrowserRendererState>({
    itemKey: null,
    message: "",
    status: "idle"
  });
  const [videoDebugEvents, setVideoDebugEvents] = useState<VideoDebugEvent[]>([]);
  const [playbackDebugEvents, setPlaybackDebugEvents] = useState<PlaybackDebugEvent[]>([]);
  const playbackSessionKeyRef = useRef(0);
  const programCycleIdRef = useRef(0);
  const failureTimerRef = useRef<number | null>(null);
  const activeItemRef = useRef<ScheduleItem | null>(null);
  const scheduleRef = useRef<Schedule | null>(null);
  const scheduleSignatureRef = useRef<string | null>(null);
  const lastScheduleSyncRef = useRef<string | null>(null);
  const missingItemMessageRef = useRef<string | null>(null);
  const heartbeatFailureCountRef = useRef(0);
  const heartbeatBackoffUntilRef = useRef(0);
  const lastWebUrlDiagnosticRef = useRef<string | null>(null);
  const waitingForRegistration =
    registration.status === "pending" ||
    ((registration.status === "discovering" || registration.status === "error") && registration.serverUrl !== null);

  useEffect(() => {
    const activeItemType = activeItem ? activeItem.type : null;
    const assignmentStatus = schedule?.assignmentStatus ?? null;
    const itemCount = schedule?.items.length ?? 0;
    const state =
      assignmentStatus === "decommissioned"
        ? "decommissioned"
        : waitingForRegistration
          ? "registration"
          : activeItem
            ? `playing:${activeItemType}`
            : itemCount === 0
              ? assignmentStatus === "unassigned"
                ? "unassigned"
                : "empty"
              : "waiting";

    window.__narrowcastingPlayerHealth = {
      activeIndex,
      assignmentStatus,
      itemCount,
      lastRenderAt: Date.now(),
      lastRenderIso: new Date().toISOString(),
      scheduleVersion: schedule?.version ?? null,
      state
    };
  });

  const resetInvalidDeviceIdentity = useCallback(() => {
    removeLocalStorage(screenIdKey);
    removeLocalStorage(deviceSecretKey);
    removeLocalStorage(serverUrlKey);
    heartbeatFailureCountRef.current = 0;
    heartbeatBackoffUntilRef.current = 0;
    setRegistration((state) => ({
      ...state,
      screenId: null,
      deviceSecret: null,
      serverUrl: null,
      status: "discovering",
      message: "Screen was removed or credentials expired. Please register this player again."
    }));
  }, []);

  function clearFailureTimer() {
    if (failureTimerRef.current !== null) {
      window.clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
  }

  const appendVideoDebugEvent = useCallback((event: VideoDebugEvent) => {
    setVideoDebugEvents((events) => [...events, event].slice(-8));
  }, []);

  const appendPlaybackDebugEvent = useCallback((event: PlaybackDebugEvent) => {
    setPlaybackDebugEvents((events) => [...events, event].slice(-10));
  }, []);

  const bumpProgramCycle = useCallback(() => {
    setProgramCycleId((cycleId) => {
      const nextCycleId = cycleId + 1;
      programCycleIdRef.current = nextCycleId;
      return nextCycleId;
    });
  }, []);

  useEffect(() => {
    if (registration.screenId && registration.deviceSecret) {
      return;
    }

    let cancelled = false;
    let registerTimer: number | null = null;

    async function registerOnce() {
      const serverUrl = await discoverServerUrl(readLocalStorage(serverUrlKey));

      if (cancelled) {
        return;
      }

      if (!serverUrl) {
        setRegistration((state) => ({
          ...state,
          serverUrl: null,
          status: "offline",
          message: "No Narrowcasting server found on this network."
        }));
        return;
      }

      writeLocalStorage(serverUrlKey, serverUrl);
      setRegistration((state) => ({
        ...state,
        serverUrl,
        status: "discovering",
        message: "Server found. Registering player..."
      }));

      try {
        const response = await fetchWithTimeout(
          `${serverUrl}/api/screens/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              playerId: registration.playerId,
              hostname: window.location.hostname || "unknown",
              userAgent: window.navigator.userAgent,
              resolution: `${window.screen.width}x${window.screen.height}`,
              orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
              version: playerVersion
            })
          },
          2500
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = await response.json();

        if (cancelled) {
          return;
        }

        if (
          body?.status === "approved" &&
          typeof body.screenId === "string" &&
          typeof body.deviceSecret === "string"
        ) {
          writeLocalStorage(screenIdKey, body.screenId);
          writeLocalStorage(deviceSecretKey, body.deviceSecret);
          void persistPlayerRegistration(
            body.screenId,
            registration.playerId,
            serverUrl,
            body.deviceSecret
          );
          setRegistration((state) => ({
            ...state,
            screenId: body.screenId,
            deviceSecret: body.deviceSecret,
            serverUrl,
            status: "approved",
            message: "Screen approved. Starting playback."
          }));
          return;
        }

        if (typeof body?.screenId === "string") {
          void persistPlayerRegistration(
            body.screenId,
            registration.playerId,
            serverUrl,
            null
          );
        }

        setRegistration((state) => ({
          ...state,
          screenId: typeof body?.screenId === "string" ? body.screenId : state.screenId,
          serverUrl,
          status: "pending",
          message:
            body?.status === "approved"
              ? "Waiting for device credentials..."
              : "Waiting for approval..."
        }));
      } catch (error) {
        setRegistration((state) => ({
          ...state,
          serverUrl,
          status: "error",
          message: error instanceof Error ? `Registration failed: ${error.message}` : "Registration failed."
        }));
      }
    }

    void registerOnce();
    registerTimer = window.setInterval(() => {
      void registerOnce();
    }, 5000);

    return () => {
      cancelled = true;

      if (registerTimer !== null) {
        window.clearInterval(registerTimer);
      }
    };
  }, [registration.deviceSecret, registration.playerId, registration.screenId]);

  useEffect(() => {
    if (!registration.screenId || !registration.deviceSecret || registration.serverUrl) {
      return;
    }

    let cancelled = false;
    let discoveryTimer: number | null = null;
    const screenId = registration.screenId;
    const playerId = registration.playerId;
    const deviceSecret = registration.deviceSecret;

    async function discoverApprovedServer() {
      const serverUrl = await discoverServerUrl(readLocalStorage(serverUrlKey));

      if (cancelled) {
        return;
      }

      if (!serverUrl) {
        setRegistration((state) => ({
          ...state,
          status: "offline",
          message: "Screen is approved, but the Narrowcasting server was not found for heartbeat."
        }));
        return;
      }

      writeLocalStorage(serverUrlKey, serverUrl);
      void persistPlayerRegistration(
        screenId,
        playerId,
        serverUrl,
        deviceSecret
      );
      setRegistration((state) => ({
        ...state,
        serverUrl,
        status: "approved",
        message: "Screen approved. Heartbeat connected."
      }));
    }

    void discoverApprovedServer();
    discoveryTimer = window.setInterval(() => {
      void discoverApprovedServer();
    }, 5000);

    return () => {
      cancelled = true;

      if (discoveryTimer !== null) {
        window.clearInterval(discoveryTimer);
      }
    };
  }, [registration.deviceSecret, registration.playerId, registration.screenId, registration.serverUrl]);

  useEffect(() => {
    if (!registration.screenId || !registration.serverUrl || !registration.deviceSecret) {
      return;
    }

    void persistPlayerRegistration(
      registration.screenId,
      registration.playerId,
      registration.serverUrl,
      registration.deviceSecret
    );
  }, [registration.deviceSecret, registration.playerId, registration.screenId, registration.serverUrl]);

  useEffect(() => {
    if (!registration.screenId || !registration.serverUrl || !registration.deviceSecret) {
      return;
    }

    let cancelled = false;
    const screenId = registration.screenId;
    const serverUrl = registration.serverUrl;
    const deviceSecret = registration.deviceSecret;

    async function sendHeartbeat() {
      if (Date.now() < heartbeatBackoffUntilRef.current) {
        return;
      }

      const active = activeItemRef.current;
      const currentSchedule = scheduleRef.current;
      const now = new Date().toISOString();
      const currentMedia =
        active?.type === "image" || active?.type === "video" ? active.file : active?.title ?? null;
      const payload = {
        screenId,
        playerId: registration.playerId,
        hostname: window.location.hostname || null,
        softwareVersion: playerVersion,
        uptime: Math.round(window.performance.now() / 1000),
        currentTime: now,
        lastSeen: now,
        currentProgram: currentSchedule?.assignedProgramName ?? null,
        currentPlaylist: null,
        currentMedia,
        currentMediaType: active?.type ?? null,
        playState: missingItemMessageRef.current
          ? "error"
          : active
            ? "playing"
            : currentSchedule && currentSchedule.items.length === 0
              ? "empty"
              : "waiting",
        cpuUsage: null,
        memoryUsage:
          "memory" in window.performance
            ? Math.round(
                ((window.performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
                  ?.usedJSHeapSize ?? 0) / 1024 / 1024
              )
            : null,
        diskFree: null,
        networkIp: null,
        resolution: `${window.screen.width}x${window.screen.height}`,
        orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
        syncStatus: currentSchedule ? "ok" : "waiting",
        lastScheduleSync: lastScheduleSyncRef.current,
        lastScheduleSignature: scheduleSignatureRef.current ? getShortSignature(scheduleSignatureRef.current) : null,
        playbackError: missingItemMessageRef.current
      };

      try {
        const response = await fetchWithTimeout(
          `${serverUrl}/api/screens/${encodeURIComponent(screenId)}/heartbeat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Narrowcasting-Device-Secret": deviceSecret
            },
            body: JSON.stringify(payload)
          },
          2500
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { code?: unknown } | null;

          if (isInvalidDeviceIdentity(response.status, body?.code)) {
            resetInvalidDeviceIdentity();
            return;
          }

          throw new Error(`heartbeat HTTP ${response.status}`);
        }

        heartbeatFailureCountRef.current = 0;
        heartbeatBackoffUntilRef.current = 0;
        setRegistration((state) =>
          state.status === "approved"
            ? state
            : {
                ...state,
                status: "approved",
                message: "Heartbeat connected."
              }
        );
      } catch {
        if (!cancelled) {
          // Playback remains local; heartbeat failures are visible on the dashboard by age.
          heartbeatFailureCountRef.current += 1;

          if (heartbeatFailureCountRef.current >= 3) {
            heartbeatBackoffUntilRef.current = Date.now() + heartbeatFailureBackoffMs;
            setRegistration((state) =>
              state.screenId === screenId && state.serverUrl === serverUrl
                ? {
                    ...state,
                    serverUrl: null,
                    status: "error",
                    message: "Heartbeat failed. Rediscovering server..."
                  }
                : state
            );
          }
        }
      }
    }

    void sendHeartbeat();
    const heartbeatTimer = window.setInterval(() => {
      void sendHeartbeat();
    }, heartbeatIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
    };
  }, [
    registration.deviceSecret,
    registration.playerId,
    registration.screenId,
    registration.serverUrl,
    resetInvalidDeviceIdentity
  ]);

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
            scheduleSignatureRef.current = nextSignature;
            lastScheduleSyncRef.current = new Date().toISOString();
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
            setProgramCycleId(0);
            programCycleIdRef.current = 0;
            setVideoDebugEvents([]);
            setPlaybackDebugEvents([]);
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

  useEffect(() => {
    activeItemRef.current = activeItem;
  }, [activeItem]);

  useEffect(() => {
    const webUrlItem = getWebUrlRenderData(activeItem);

    if (!webUrlItem) {
      return;
    }

    const diagnosticKey = `${playbackSessionKey}:${activeIndex}:${webUrlItem.id}:${webUrlItem.url}`;

    if (lastWebUrlDiagnosticRef.current === diagnosticKey) {
      return;
    }

    lastWebUrlDiagnosticRef.current = diagnosticKey;
    console.info("rendering web_url iframe", {
      itemId: webUrlItem.id,
      itemType: webUrlItem.itemType,
      renderType: webUrlItem.renderType,
      url: webUrlItem.url,
      hasRenderableUrl: isRenderableWebUrl(webUrlItem.url),
      activeIndex,
      playbackSessionKey
    });
  }, [activeIndex, activeItem, playbackSessionKey]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    missingItemMessageRef.current = missingItemMessage;
  }, [missingItemMessage]);

  const emitPlaybackDebug = useCallback(
    (
      event: string,
      options: Partial<
        Pick<
          PlaybackDebugEvent,
          "reason" | "computedDurationMs" | "scheduledSessionKey" | "nextIndex" | "note"
        >
      > = {}
    ) => {
      const debugEvent: PlaybackDebugEvent = {
        time: new Date().toLocaleTimeString(),
        event,
        reason: options.reason,
        itemId: activeItem?.id ?? null,
        itemType: activeItem?.type ?? null,
        itemIndex: activeIndex,
        itemCount: schedule?.items.length ?? 0,
        duration: typeof activeItem?.duration === "number" ? activeItem.duration : null,
        computedDurationMs: options.computedDurationMs,
        cycleId: programCycleId,
        epoch: playbackEpoch,
        playbackSessionKey,
        playbackSessionKeyRef: playbackSessionKeyRef.current,
        scheduledSessionKey: options.scheduledSessionKey,
        nextIndex: options.nextIndex,
        note: options.note
      };

      if (debugInfo.enabled) {
        console.info("playback lifecycle", debugEvent);
      }

      appendPlaybackDebugEvent(debugEvent);
    },
    [
      activeIndex,
      activeItem,
      appendPlaybackDebugEvent,
      debugInfo.enabled,
      playbackEpoch,
      playbackSessionKey,
      programCycleId,
      schedule
    ]
  );

  useEffect(() => {
    emitPlaybackDebug("active item changed", {
      note: activeItem
        ? `active ${activeItem.type} ${activeItem.id}`
        : "no active item"
    });
  }, [activeItem, emitPlaybackDebug]);

  const advanceToNextItem = useCallback((sessionKey = playbackSessionKeyRef.current, reason = "unknown") => {
    emitPlaybackDebug("advance called", {
      reason,
      scheduledSessionKey: sessionKey
    });

    if (sessionKey !== playbackSessionKeyRef.current) {
      emitPlaybackDebug("advance ignored", {
        reason,
        scheduledSessionKey: sessionKey,
        note: "stale playback session key"
      });
      return;
    }

    if (!schedule || schedule.items.length === 0) {
      emitPlaybackDebug("advance ignored", {
        reason,
        scheduledSessionKey: sessionKey,
        note: "no schedule items"
      });
      return;
    }

    if (schedule.items.length === 1) {
      emitPlaybackDebug("advance single-item loop", {
        reason,
        scheduledSessionKey: sessionKey,
        nextIndex: 0
      });
      bumpProgramCycle();
      setPlaybackEpoch((epoch) => epoch + 1);
      return;
    }

    setActiveIndex((index) => {
      const nextIndex = (index + 1) % schedule.items.length;

      appendPlaybackDebugEvent({
        time: new Date().toLocaleTimeString(),
        event: "advance apply index",
        reason,
        itemId: activeItem?.id ?? null,
        itemType: activeItem?.type ?? null,
        itemIndex: index,
        itemCount: schedule.items.length,
        duration: typeof activeItem?.duration === "number" ? activeItem.duration : null,
        cycleId: programCycleIdRef.current,
        epoch: playbackEpoch,
        playbackSessionKey,
        playbackSessionKeyRef: playbackSessionKeyRef.current,
        scheduledSessionKey: sessionKey,
        nextIndex
      });

      if (nextIndex === 0) {
        bumpProgramCycle();
      }

      return nextIndex;
    });
  }, [
    activeItem,
    appendPlaybackDebugEvent,
    bumpProgramCycle,
    emitPlaybackDebug,
    playbackEpoch,
    playbackSessionKey,
    schedule
  ]);

  useEffect(() => {
    const webUrlItem = getWebUrlRenderData(activeItem);

    if (!activeItem || !schedule || !webUrlItem || webUrlItem.webUrlRenderMode !== "browser") {
      removeLocalStorage(browserRendererResumeKey);
      setBrowserRendererState((state) =>
        state.status === "idle" ? state : { itemKey: null, message: "", status: "idle" }
      );
      return;
    }

    const browserRun = getBrowserRendererRun(schedule, activeIndex);
    const durationMs = browserRun?.durationMs ?? Math.max(typeof activeItem.duration === "number" ? activeItem.duration : 10, 1) * 1000;
    const itemKey = browserRun?.sessionSignature ?? `${activeIndex}:${activeItem.id}`;
    const resume = readBrowserRendererResume();

    if (browserRun && resume?.sessionSignature === browserRun.sessionSignature) {
      if (Date.now() <= resume.expiresAt) {
        removeLocalStorage(browserRendererResumeKey);
        setBrowserRendererState({
          itemKey,
          message: "Browser renderer returned to Player. Resuming schedule.",
          status: "idle"
        });
        console.info("browser session closed", {
          nextIndex: resume.nextIndex,
          sessionSignature: browserRun.sessionSignature
        });
        setActiveIndex(resume.nextIndex);
        if (resume.nextIndex === activeIndex) {
          bumpProgramCycle();
          setPlaybackEpoch((epoch) => epoch + 1);
        }
        return;
      }

      removeLocalStorage(browserRendererResumeKey);
    }

    if (!isRenderableWebUrl(webUrlItem.url)) {
      setBrowserRendererState({
        itemKey,
        message: "Browser renderer cannot start because the resolved URL is invalid.",
        status: "failed"
      });
      return;
    }

    writeBrowserRendererResume(browserRun?.sessionSignature ?? itemKey, durationMs, browserRun?.nextIndex ?? ((activeIndex + 1) % schedule.items.length));
    console.info("browser session started", {
      allItemsSameSession: browserRun?.allItemsSameSession ?? false,
      durationSeconds: Math.ceil(durationMs / 1000),
      itemCount: browserRun?.itemCount ?? 1,
      nextIndex: browserRun?.nextIndex ?? ((activeIndex + 1) % schedule.items.length),
      url: webUrlItem.url
    });
    if (browserRun && browserRun.itemCount > 1) {
      console.info("browser session reused consecutive items", {
        itemCount: browserRun.itemCount,
        url: webUrlItem.url
      });
    }
    setBrowserRendererState({
      itemKey,
      message: "Opening web page in local Chromium kiosk...",
      status: "starting"
    });

    const controller = new AbortController();
    const playerUrl = `${window.location.origin}/player`;
    let handoffFallbackTimer: number | null = null;

    void fetch(browserRendererControlUrl, {
      body: JSON.stringify({
        browserActions: webUrlItem.browserActions,
        durationSeconds: Math.ceil(durationMs / 1000),
        playerUrl,
        url: webUrlItem.url
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Browser renderer rejected handoff with HTTP ${response.status}`);
        }

        console.info("browser renderer handoff accepted", {
          durationSeconds: Math.ceil(durationMs / 1000),
          itemCount: browserRun?.itemCount ?? 1,
          playerUrl,
          url: webUrlItem.url
        });
        setBrowserRendererState({
          itemKey,
          message: "Browser renderer active. Returning automatically after the configured duration.",
          status: "active"
        });
        handoffFallbackTimer = window.setTimeout(() => {
          if (playbackSessionKey !== playbackSessionKeyRef.current) {
            return;
          }

          removeLocalStorage(browserRendererResumeKey);
          setBrowserRendererState({
            itemKey,
            message: "Browser renderer did not take over. Continuing schedule.",
            status: "failed"
          });
          advanceToNextItem(playbackSessionKey, "browser renderer takeover timeout");
        }, 8000);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        removeLocalStorage(browserRendererResumeKey);
        console.warn("browser renderer handoff failed", error);
        setBrowserRendererState({
          itemKey,
          message: "Browser renderer unavailable. Continuing schedule.",
          status: "failed"
        });

        window.setTimeout(() => {
          if (playbackSessionKey === playbackSessionKeyRef.current) {
            advanceToNextItem(playbackSessionKey, "browser renderer handoff failed");
          }
        }, 3000);
      });

    return () => {
      controller.abort();
      if (handoffFallbackTimer !== null) {
        window.clearTimeout(handoffFallbackTimer);
      }
    };
  }, [activeIndex, activeItem, advanceToNextItem, bumpProgramCycle, playbackEpoch, playbackSessionKey, schedule]);

  const handleActiveItemFailure = useCallback(
    (sessionKey: number, message: string) => {
      emitPlaybackDebug("failure handler called", {
        reason: "media failure",
        scheduledSessionKey: sessionKey,
        note: message
      });

      if (sessionKey !== playbackSessionKeyRef.current) {
        emitPlaybackDebug("failure handler ignored", {
          reason: "media failure",
          scheduledSessionKey: sessionKey,
          note: "stale playback session key"
        });
        return;
      }

      clearFailureTimer();
      emitPlaybackDebug("failure timer cleared", {
        reason: "media failure",
        scheduledSessionKey: sessionKey,
        note: "cleared before scheduling/handling failure"
      });
      setMissingItemMessage(message);

      if (!schedule || schedule.items.length === 0) {
        emitPlaybackDebug("failure handler stopped", {
          reason: "media failure",
          scheduledSessionKey: sessionKey,
          note: "no schedule items"
        });
        return;
      }

      if (schedule.items.length === 1) {
        emitPlaybackDebug("failure handler stopped", {
          reason: "media failure",
          scheduledSessionKey: sessionKey,
          note: "single item; showing media unavailable"
        });
        return;
      }

      emitPlaybackDebug("failure timer scheduled", {
        reason: "media failure",
        scheduledSessionKey: sessionKey,
        computedDurationMs: 300
      });
      failureTimerRef.current = window.setTimeout(() => {
        emitPlaybackDebug("failure timer fired", {
          reason: "media failure",
          scheduledSessionKey: sessionKey
        });

        if (sessionKey !== playbackSessionKeyRef.current) {
          emitPlaybackDebug("failure timer ignored", {
            reason: "media failure",
            scheduledSessionKey: sessionKey,
            note: "stale playback session key"
          });
          return;
        }

        setMissingItemMessage(null);
        advanceToNextItem(sessionKey, "failure timer fired");
      }, 300);
    },
    [advanceToNextItem, emitPlaybackDebug, schedule]
  );

  function renderActiveItem(className: string, regionId = "standalone", activeVisible = true) {
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
      const videoKey = getItemKey(activeItem, schedule, activeIndex, playbackEpoch, playbackSessionKey);
      const src = getMediaUrl(activeItem.file);

      return (
        <>
          <InstrumentedVideo
            activeIndex={activeIndex}
            activeVisible={activeVisible}
            className={className}
            debugEnabled={debugInfo.enabled}
            item={activeItem}
            key={videoKey}
            onAdvance={(incomingSessionKey, reason) => {
              if (incomingSessionKey !== playbackSessionKeyRef.current) {
                emitPlaybackDebug("video advance ignored", {
                  reason,
                  scheduledSessionKey: incomingSessionKey,
                  note: "stale playback session key before advance"
                });
                return;
              }

              advanceToNextItem(incomingSessionKey, reason);
            }}
            onDebugEvent={appendVideoDebugEvent}
            onFailure={(incomingSessionKey, message) => {
              if (incomingSessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              handleActiveItemFailure(incomingSessionKey, message);
            }}
            playbackEpoch={playbackEpoch}
            programCycleId={programCycleId}
            regionId={regionId}
            sessionKey={sessionKey}
            src={src}
            videoKey={videoKey}
          />
          <p className="missing-media-message">{missingItemMessage ?? `Media unavailable: ${activeItem.file}`}</p>
        </>
      );
    }

    const webUrlItem = getWebUrlRenderData(activeItem);

    if (webUrlItem) {
      if (webUrlItem.webUrlRenderMode === "browser") {
        return (
          <section className="web-url-fallback browser-renderer-handoff">
            <p className="status-label">Browser renderer</p>
            <h1>{webUrlItem.title ?? "Opening web page"}</h1>
            <p className="supporting-copy">
              {browserRendererState.message || "Opening this URL in the local Chromium kiosk."}
            </p>
          </section>
        );
      }

      if (!isRenderableWebUrl(webUrlItem.url)) {
        return (
          <section className="web-url-fallback">
            <p className="status-label">Web URL unavailable</p>
            <h1>{webUrlItem.title ?? "Web URL unavailable"}</h1>
            <p className="supporting-copy">The resolved schedule item does not contain a valid http or https URL.</p>
          </section>
        );
      }

      return (
        <iframe
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          className="web-url-frame"
          key={getItemKey(activeItem, schedule, activeIndex, playbackEpoch, playbackSessionKey)}
          onError={() => {
            console.warn("web_url iframe error", {
              itemId: webUrlItem.id,
              url: webUrlItem.url
            });
          }}
          onLoad={() => {
            console.info("web_url iframe loaded", {
              itemId: webUrlItem.id,
              url: webUrlItem.url
            });
          }}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          src={webUrlItem.url}
          title={webUrlItem.title ?? webUrlItem.url}
        />
      );
    }

    if (activeItem.type === "rss_item") {
      return (
        <article className="rss-card" key={getItemKey(activeItem, schedule, activeIndex, playbackEpoch, playbackSessionKey)}>
          {activeItem.image ? <img alt="" className="rss-card-image" src={activeItem.image} /> : null}
          <div className="rss-card-content">
            {activeItem.sourceTitle ? <p className="status-label">{activeItem.sourceTitle}</p> : null}
            <h1>{activeItem.title}</h1>
            {activeItem.summary ? <p className="supporting-copy">{activeItem.summary}</p> : null}
            <div className="rss-card-meta">
              {activeItem.publishedAt ? <span>{new Date(activeItem.publishedAt).toLocaleString()}</span> : null}
              {activeItem.link ? <span>{activeItem.link}</span> : null}
            </div>
          </div>
        </article>
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
        <span>Cycle: {programCycleId}</span>
        <span>Media: {activeItem?.id ?? "none"}</span>
        {playbackDebugEvents.length > 0 ? (
          <div className="playback-debug-events">
            <strong>Playback</strong>
            {playbackDebugEvents.map((event, index) => (
              <span key={`${event.time}-${event.event}-${index}`}>
                {event.time} {event.event} reason:{event.reason ?? "-"} item:{event.itemType ?? "-"}:
                {event.itemId ?? "-"} idx:{event.itemIndex}/{event.itemCount} dur:
                {event.duration ?? "-"} ms:{event.computedDurationMs ?? "-"} c:{event.cycleId} e:
                {event.epoch} sess:{event.playbackSessionKey}/{event.playbackSessionKeyRef} scheduled:
                {event.scheduledSessionKey ?? "-"} next:{event.nextIndex ?? "-"}{" "}
                {event.note ? `(${event.note})` : ""}
              </span>
            ))}
          </div>
        ) : null}
        {videoDebugEvents.length > 0 ? (
          <div className="video-debug-events">
            <strong>Video</strong>
            {videoDebugEvents.map((event, index) => (
              <span key={`${event.time}-${event.event}-${index}`}>
                {event.time} {event.event} i:{event.itemIndex} c:{event.cycleId} e:{event.epoch} r:
                {event.readyState ?? "-"} n:{event.networkState ?? "-"} p:
                {event.paused === null ? "-" : event.paused ? "yes" : "no"} end:
                {event.ended === null ? "-" : event.ended ? "yes" : "no"} t:
                {event.currentTime ?? "-"} ref:{event.refReady ? "yes" : "no"} src:
                {event.renderedSrcAttribute ?? "-"} play:{event.playCalled ? "yes" : "no"} load:
                {event.loadCalled ? "yes" : "no"} skip:{event.playSkippedReason ?? "-"}{" "}
                {event.note ? `(${event.note})` : ""}
              </span>
            ))}
          </div>
        ) : null}
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
    if (activeItem?.type === "video") {
      emitPlaybackDebug("advance timer skipped", {
        reason: "duration timer",
        note: "video items advance on ended/watchdog, not generic duration"
      });
      return;
    }

    const webUrlItem = getWebUrlRenderData(activeItem);

    if (webUrlItem?.webUrlRenderMode === "browser") {
      emitPlaybackDebug("advance timer skipped", {
        reason: "duration timer",
        note: "browser-rendered web URL advances through Agent browser renderer handoff"
      });
      return;
    }

    if (!activeItem || !schedule || typeof activeItem.duration !== "number") {
      emitPlaybackDebug("advance timer skipped", {
        reason: "duration timer",
        note: !activeItem
          ? "no active item"
          : !schedule
            ? "no schedule"
            : "active item has no numeric duration"
      });
      return;
    }

    if (schedule.items.length <= 1) {
      emitPlaybackDebug("advance timer skipped", {
        reason: "duration timer",
        note: "single non-video item"
      });
      return;
    }

    const durationMs = Math.max(activeItem.duration, 1) * 1000;
    const scheduledSessionKey = playbackSessionKey;
    emitPlaybackDebug("advance timer scheduled", {
      reason: "duration timer",
      computedDurationMs: durationMs,
      scheduledSessionKey
    });
    const rotationTimer = window.setTimeout(() => {
      emitPlaybackDebug("advance timer fired", {
        reason: "duration timer",
        computedDurationMs: durationMs,
        scheduledSessionKey
      });
      advanceToNextItem(scheduledSessionKey, "duration timer fired");
    }, durationMs);

    return () => {
      window.clearTimeout(rotationTimer);
      emitPlaybackDebug("advance timer cleared", {
        reason: "duration timer",
        computedDurationMs: durationMs,
        scheduledSessionKey
      });
    };
  }, [activeItem, advanceToNextItem, emitPlaybackDebug, playbackSessionKey, schedule]);

  const isDecommissioned = schedule?.assignmentStatus === "decommissioned";

  useEffect(() => {
    if (isDecommissioned && registration.deviceSecret) {
      resetInvalidDeviceIdentity();
    }
  }, [isDecommissioned, registration.deviceSecret, resetInvalidDeviceIdentity]);

  if (isDecommissioned) {
    return (
      <main className="player-shell">
        <section className="playback-surface decommissioned-surface" aria-label="Screen decommissioned">
          <p className="status-label">Screen registration</p>
          <h1>Screen decommissioned</h1>
          <p className="supporting-copy">Register this player again from the dashboard.</p>
        </section>
        <footer className="status-bar">
          <span>Playback: decommissioned</span>
          <span>Schedule: version {schedule.version}</span>
          <span>Reload: every 30s</span>
        </footer>
        {renderDebugOverlay()}
      </main>
    );
  }

  if (waitingForRegistration) {
    return (
      <main className="player-shell registration-shell">
        <section className="playback-surface registration-surface" aria-label="Player registration">
          <p className="status-label">Waiting for registration</p>
          <h1>Waiting for registration</h1>
          <div className="registration-details">
            <span>Player ID</span>
            <strong>{registration.playerId}</strong>
            <span>Hostname</span>
            <strong>{registration.hostname}</strong>
            <span>Connection status</span>
            <strong>{registration.status}</strong>
            <span>Server found</span>
            <strong>{registration.serverUrl ?? "not yet"}</strong>
            <span>Approval</span>
            <strong>{registration.message}</strong>
          </div>
        </section>
      </main>
    );
  }

  if (!activeItem) {
    const hasEmptyPlaylist = schedule !== null && schedule.items.length === 0;
    const hasNoProgramAssignment = schedule?.assignmentStatus === "unassigned";

    return (
      <main className="player-shell">
        <section className="playback-surface" aria-label="Local playlist playback">
          <p className="status-label">
            {hasNoProgramAssignment
              ? "Screen assignment"
              : hasEmptyPlaylist
                ? `Local schedule version ${schedule.version}`
                : "Waiting for local schedule"}
          </p>
          <h1>
            {hasNoProgramAssignment
              ? "No program assigned."
              : hasEmptyPlaylist
                ? "Playlist is empty"
                : "Waiting for local schedule"}
          </h1>
        </section>
        <footer className="status-bar">
          <span>
            Playback:{" "}
            {hasNoProgramAssignment
                ? "no program assigned"
                : hasEmptyPlaylist
                  ? "empty playlist"
                  : "waiting"}
          </span>
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
                {renderActiveItem("themed-media", programRegion.id, true)}
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
          activeItem.type === "image" || activeItem.type === "video" || getWebUrlRenderData(activeItem) ? "image-surface" : ""
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
