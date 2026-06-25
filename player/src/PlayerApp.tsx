import { useCallback, useEffect, useMemo, useState } from "react";
import type { Schedule } from "./schedule/types";

const reloadIntervalMs = 30_000;

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

export function PlayerApp() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackEpoch, setPlaybackEpoch] = useState(0);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    let cancelled = false;

    async function loadSchedule() {
      try {
        const response = await fetch(`/data/schedule.json?t=${Date.now()}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          if (!cancelled) {
            setSchedule((existingSchedule) => existingSchedule);
          }
          return;
        }

        const body: unknown = await response.json();

        if (isSchedule(body) && !cancelled) {
          setSchedule(body);
          setActiveIndex((index) => (body.items.length > 0 ? index % body.items.length : 0));
          setLastLoadedAt(new Date().toLocaleTimeString());
        }
      } catch {
        if (!cancelled) {
          setSchedule((existingSchedule) => existingSchedule);
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

  const activeItem = useMemo(() => {
    if (!schedule || schedule.items.length === 0) {
      return null;
    }

    return schedule.items[activeIndex % schedule.items.length];
  }, [activeIndex, schedule]);

  const advanceToNextItem = useCallback(() => {
    if (!schedule || schedule.items.length === 0) {
      return;
    }

    if (schedule.items.length === 1) {
      setPlaybackEpoch((epoch) => epoch + 1);
      return;
    }

    setActiveIndex((index) => (index + 1) % schedule.items.length);
  }, [schedule]);

  function renderActiveItem(className: string) {
    if (!activeItem) {
      return null;
    }

    if (activeItem.type === "image") {
      return (
        <>
          <img
            alt=""
            className={className}
            onError={(event) => {
              event.currentTarget.dataset.missing = "true";
            }}
            src={`/media/${encodeURIComponent(activeItem.file)}`}
          />
          <p className="missing-media-message">Missing local image: {activeItem.file}</p>
        </>
      );
    }

    if (activeItem.type === "video") {
      return (
        <video
          autoPlay
          className={className}
          key={`${activeItem.id}-${schedule?.version}-${activeIndex}-${playbackEpoch}`}
          muted
          onCanPlay={(event) => {
            void event.currentTarget.play().catch(() => {
              advanceToNextItem();
            });
          }}
          onEnded={() => {
            advanceToNextItem();
          }}
          onError={() => {
            advanceToNextItem();
          }}
          playsInline
          preload="auto"
          src={`/media/${encodeURIComponent(activeItem.file)}`}
        />
      );
    }

    return <h1>{activeItem.title}</h1>;
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
      advanceToNextItem();
    }, durationMs);

    return () => {
      window.clearTimeout(rotationTimer);
    };
  }, [activeItem, advanceToNextItem, schedule]);

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
      </main>
    );
  }

  const theme = schedule?.theme;
  const programRegion = theme?.regions.find((region) => region.type === "program");

  if (theme && programRegion) {
    const scale = Math.min(
      viewportSize.width / theme.canvasWidth,
      viewportSize.height / theme.canvasHeight
    );

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
            <div
              className="theme-program-region"
              style={{
                left: `${programRegion.x}px`,
                top: `${programRegion.y}px`,
                width: `${programRegion.width}px`,
                height: `${programRegion.height}px`
              }}
            >
              {renderActiveItem("themed-media")}
            </div>
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
    </main>
  );
}
