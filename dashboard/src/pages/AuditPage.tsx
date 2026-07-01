import { useEffect, useMemo, useState } from "react";
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

type AuditFilter = "all" | "action" | "screen" | "campaign" | "user-system";

function formatDateTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState("Loading audit events...");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AuditFilter>("all");

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

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...events]
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .filter((event) => {
        if (filter === "action" && event.objectType.toLowerCase() !== "action") {
          return event.action.trim().length > 0;
        }

        if (filter === "screen" && !`${event.objectType} ${event.objectName ?? ""} ${event.objectId ?? ""}`.toLowerCase().includes("screen")) {
          return false;
        }

        if (filter === "campaign" && !`${event.objectType} ${event.objectName ?? ""} ${event.objectId ?? ""}`.toLowerCase().includes("campaign")) {
          return false;
        }

        if (filter === "user-system" && event.actorType !== "user" && event.actorType !== "system") {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          event.action,
          event.objectType,
          event.objectName,
          event.objectId,
          event.actorType,
          event.actorId,
          event.source,
          event.result,
          event.reason
        ]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(query));
      });
  }, [events, filter, search]);

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
          <span>{filteredEvents.length} shown / {events.length} total</span>
        </div>
        <div className="audit-toolbar">
          <label>
            Search audit
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Action, screen, campaign, actor..."
              value={search}
            />
          </label>
          <div className="operator-filter-row" role="group" aria-label="Audit filter">
            {[
              ["all", "All"],
              ["action", "Action"],
              ["screen", "Screen"],
              ["campaign", "Campaign"],
              ["user-system", "User/System"]
            ].map(([value, label]) => (
              <button
                className={filter === value ? "operator-chip active" : "operator-chip"}
                key={value}
                onClick={() => setFilter(value as AuditFilter)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {events.length === 0 ? <p className="operator-empty">No audit events yet.</p> : null}
        {events.length > 0 && filteredEvents.length === 0 ? <p className="operator-empty">No audit events match this filter.</p> : null}
        {filteredEvents.length > 0 ? (
          <div className="audit-event-list">
            {filteredEvents.map((event) => (
              <article className={`audit-event-row ${event.result}`} key={event.id}>
                <div>
                  <strong>
                    {event.action} {event.objectType}
                  </strong>
                  <span>{event.objectName ?? event.objectId ?? "-"}</span>
                </div>
                <div>
                  <span>{event.result}</span>
                  <small>{formatDateTime(event.timestamp)}</small>
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
