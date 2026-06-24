import { useEffect, useMemo, useState } from "react";
import type { Schedule } from "./schedule/types";

const reloadIntervalMs = 30_000;

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
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

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

  const activeItem = useMemo(() => {
    if (!schedule || schedule.items.length === 0) {
      return null;
    }

    return schedule.items[activeIndex % schedule.items.length];
  }, [activeIndex, schedule]);

  useEffect(() => {
    if (!activeItem || !schedule || schedule.items.length <= 1) {
      return;
    }

    const durationMs = Math.max(activeItem.duration, 1) * 1000;
    const rotationTimer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % schedule.items.length);
    }, durationMs);

    return () => {
      window.clearTimeout(rotationTimer);
    };
  }, [activeItem, schedule]);

  if (!activeItem) {
    return (
      <main className="player-shell">
        <section className="playback-surface" aria-label="Local playlist playback">
          <p className="status-label">Waiting for local schedule</p>
          <h1>Waiting for local schedule</h1>
        </section>
        <footer className="status-bar">
          <span>Playback: waiting</span>
          <span>Schedule: not cached</span>
          <span>Reload: every 30s</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="player-shell">
      <section className="playback-surface" aria-label="Local playlist playback">
        <p className="status-label">Local schedule version {schedule?.version}</p>
        <h1>{activeItem.title}</h1>
      </section>
      <footer className="status-bar">
        <span>Playback: local</span>
        <span>
          Item {activeIndex + 1} / {schedule?.items.length}
        </span>
        <span>Duration: {activeItem.duration}s</span>
        <span>Loaded: {lastLoadedAt ?? "unknown"}</span>
      </footer>
    </main>
  );
}
