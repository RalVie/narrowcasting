import { useEffect, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { Schedule } from "../scheduleTypes";
import type { ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;

export function SchedulePreviewPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadScreens() {
    try {
      const response = await fetch(apiUrl("/api/screens"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as ScreenRecord[];
      const approvedScreens = body.filter((screen) => screen.status === "approved");
      setScreens(approvedScreens);
      setSelectedScreenId((currentScreenId) => {
        if (currentScreenId && approvedScreens.some((screen) => screen.screenId === currentScreenId)) {
          return currentScreenId;
        }

        return approvedScreens[0]?.screenId ?? "";
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load screens");
    }
  }

  async function loadSchedule(screenId: string) {
    if (!screenId) {
      setSchedule(null);
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/schedule?screenId=${encodeURIComponent(screenId)}`));

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      const body = (await response.json()) as Schedule;
      setSchedule(body);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load schedule");
    }
  }

  useEffect(() => {
    void loadScreens();
  }, []);

  useEffect(() => {
    void loadSchedule(selectedScreenId);
    const timer = window.setInterval(() => {
      void loadSchedule(selectedScreenId);
    }, refreshIntervalMs);
    const handlePlaylistSaved = () => {
      void loadSchedule(selectedScreenId);
    };

    window.addEventListener("narrowcasting:playlist-saved", handlePlaylistSaved);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("narrowcasting:playlist-saved", handlePlaylistSaved);
    };
  }, [selectedScreenId]);

  return (
    <section className="page-section" id="schedule-preview">
      <div className="section-header">
        <div>
          <h2>Schedule Preview</h2>
          <p>Read-only preview of the Resolver schedule for a selected screen.</p>
        </div>
        <span className="readonly-pill">Read-only</span>
      </div>

      <div className="playlist-schedule-fields">
        <label>
          Screen
          <select
            value={selectedScreenId}
            onChange={(event) => setSelectedScreenId(event.target.value)}
          >
            {screens.length === 0 ? <option value="">No approved screens</option> : null}
            {screens.map((screen) => (
              <option key={screen.screenId} value={screen.screenId}>
                {screen.name} ({screen.hostname})
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" onClick={() => void loadScreens()} type="button">
          Refresh Screens
        </button>
      </div>

      {screens.length === 0 ? (
        <p className="status-text">
          Approve a screen first, then use Schedule Preview or Scheduler Diagnostics to inspect the resolved schedule.
        </p>
      ) : null}

      {error ? <p className="error-text">Server schedule unavailable: {error}</p> : null}

      {schedule ? (
        <div className="schedule-preview">
          <dl>
            <div>
              <dt>Version</dt>
              <dd>{schedule.version}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{schedule.updatedAt}</dd>
            </div>
          </dl>

          <div className="schedule-items">
            {schedule.items.length === 0 ? <p>Playlist is empty.</p> : null}

            {schedule.items.map((item) => (
              <article className="schedule-item" key={item.id}>
                <div>
                  <h3>{item.type === "image" || item.type === "video" ? item.file : item.title}</h3>
                  <p>
                    Type: {item.type}
                    {item.type === "image" || item.type === "video" ? ` | File: ${item.file}` : ""}
                  </p>
                </div>
                <span>{typeof item.duration === "number" ? `${item.duration}s` : "until ended"}</span>
              </article>
            ))}
          </div>
        </div>
      ) : !error ? (
        <p>Loading schedule preview...</p>
      ) : null}
    </section>
  );
}
