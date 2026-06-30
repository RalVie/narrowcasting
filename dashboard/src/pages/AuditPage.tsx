import { useEffect, useState } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";

interface AuditEvent {
  id: string;
  timestamp: string;
  actorType: string;
  actorId?: string | null;
  source: string;
  action: string;
  objectType: string;
  objectId?: string | null;
  objectName?: string | null;
  result: "success" | "failure";
  reason?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState("Loading audit events...");

  async function loadAuditEvents() {
    try {
      const response = await fetch(apiUrl("/api/audit?limit=100"));

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as { events?: AuditEvent[] };

      setEvents(Array.isArray(body.events) ? body.events : []);
      setStatus("Audit events refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load audit events: ${error.message}` : "Unable to load audit events.");
    }
  }

  useEffect(() => {
    void loadAuditEvents();
  }, []);

  return (
    <section className="page-section" id="audit">
      <div className="section-heading">
        <div>
          <h2>Audit</h2>
          <p>Append-only trace of important operator and system actions.</p>
        </div>
        <button onClick={() => void loadAuditEvents()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      <section className="operator-panel">
        <div className="operator-panel-header">
          <h3>Recent Events</h3>
          <span>{events.length}</span>
        </div>
        {events.length === 0 ? <p className="operator-empty">No audit events yet.</p> : null}
        {events.length > 0 ? (
          <div className="audit-event-list">
            {events.map((event) => (
              <article className={`audit-event-row ${event.result}`} key={event.id}>
                <div>
                  <strong>
                    {event.action} {event.objectType}
                  </strong>
                  <span>{event.objectName ?? event.objectId ?? "-"}</span>
                </div>
                <div>
                  <span>{event.result}</span>
                  <small>{new Date(event.timestamp).toLocaleString()}</small>
                </div>
                <p>{event.reason ?? "-"}</p>
                <small>
                  {event.actorType}
                  {event.actorId ? ` / ${event.actorId}` : ""} / {event.source}
                  {event.correlationId ? ` / ${event.correlationId}` : ""}
                </small>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

