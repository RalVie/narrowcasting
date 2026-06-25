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

interface InstrumentedVideoProps {
  activeIndex: number;
  className: string;
  debugEnabled: boolean;
  item: Extract<ScheduleItem, { type: "video" }>;
  activeVisible: boolean;
  onAdvance: (sessionKey: number) => void;
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

    emit("load skipped", "diagnostic-only patch: relying on native src/preload/autoplay path", videoRef.current, {
      loadCalled: false,
      playSkippedReason: "not forcing load() in diagnostic patch"
    });
    emit("play skipped", "play() is currently called only from onCanPlay", videoRef.current, {
      playCalled: false,
      playSkippedReason: "waiting for canplay handler"
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
            onAdvance(sessionKey);
          });
      }}
      onEnded={(event) => {
        emit("ended", undefined, event.currentTarget);
        onAdvance(sessionKey);
      }}
      onError={(event) => {
        event.currentTarget.dataset.missing = "true";
        emit("error", "media element error", event.currentTarget);
        onFailure(sessionKey, `Media unavailable: ${item.file}`);
      }}
      onLoadedMetadata={(event) => {
        emit("loadedmetadata", undefined, event.currentTarget);
      }}
      onPause={(event) => {
        emit("pause", undefined, event.currentTarget);
      }}
      onPlay={(event) => {
        emit("play event", undefined, event.currentTarget);
      }}
      onPlaying={(event) => {
        emit("playing", undefined, event.currentTarget);
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
  const [videoDebugEvents, setVideoDebugEvents] = useState<VideoDebugEvent[]>([]);
  const playbackSessionKeyRef = useRef(0);
  const programCycleIdRef = useRef(0);
  const failureTimerRef = useRef<number | null>(null);

  function clearFailureTimer() {
    if (failureTimerRef.current !== null) {
      window.clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
  }

  const appendVideoDebugEvent = useCallback((event: VideoDebugEvent) => {
    setVideoDebugEvents((events) => [...events, event].slice(-8));
  }, []);

  const bumpProgramCycle = useCallback(() => {
    setProgramCycleId((cycleId) => {
      const nextCycleId = cycleId + 1;
      programCycleIdRef.current = nextCycleId;
      return nextCycleId;
    });
  }, []);

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
            setProgramCycleId(0);
            programCycleIdRef.current = 0;
            setVideoDebugEvents([]);
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
      bumpProgramCycle();
      setPlaybackEpoch((epoch) => epoch + 1);
      return;
    }

    setActiveIndex((index) => {
      const nextIndex = (index + 1) % schedule.items.length;

      if (nextIndex === 0) {
        bumpProgramCycle();
      }

      return nextIndex;
    });
  }, [bumpProgramCycle, schedule]);

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
            onAdvance={(incomingSessionKey) => {
              if (incomingSessionKey !== playbackSessionKeyRef.current) {
                return;
              }

              advanceToNextItem(incomingSessionKey);
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
