import { useEffect, useState } from "react";
import type { Schedule } from "../scheduleTypes";

const scheduleUrl = "http://localhost:3000/api/schedule";

export function SchedulePreviewPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const response = await fetch(scheduleUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as Schedule;
        setSchedule(body);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load schedule");
      }
    }

    void loadSchedule();
  }, []);

  return (
    <section className="page-section" id="schedule-preview">
      <div className="section-header">
        <div>
          <h2>Schedule Preview</h2>
          <p>Read-only preview of the current server schedule.</p>
        </div>
        <span className="readonly-pill">Read-only</span>
      </div>

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
            {schedule.items.map((item) => (
              <article className="schedule-item" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.type}</p>
                </div>
                <span>{item.duration}s</span>
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
