import { useEffect, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { AgentStatus, PlayerCacheStatus, SystemStatus } from "../statusTypes";

const refreshIntervalMs = 10_000;

export function SystemStatusPage() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [playerCache, setPlayerCache] = useState<PlayerCacheStatus | null>(null);
  const [status, setStatus] = useState("Loading system status...");

  async function loadStatus() {
    try {
      const [systemResponse, agentResponse, cacheResponse] = await Promise.all([
        fetch(apiUrl("/api/status")),
        fetch(apiUrl("/api/agent-status")),
        fetch(apiUrl("/api/player-cache"))
      ]);

      if (!systemResponse.ok || !agentResponse.ok || !cacheResponse.ok) {
        throw new Error("one or more status endpoints are unavailable");
      }

      setSystemStatus((await systemResponse.json()) as SystemStatus);
      setAgentStatus((await agentResponse.json()) as AgentStatus);
      setPlayerCache((await cacheResponse.json()) as PlayerCacheStatus);
      setStatus("Status refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load status: ${error.message}` : "Unable to load status.");
    }
  }

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => {
      void loadStatus();
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="page-section" id="system-status">
      <div className="section-header">
        <div>
          <h2>System Status</h2>
          <p>Remote view of the Pi server, agent sync, and local player cache.</p>
        </div>
        <button onClick={() => void loadStatus()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      <div className="status-grid">
        <article>
          <span>Server</span>
          <strong>{systemStatus?.server ?? "unknown"}</strong>
        </article>
        <article>
          <span>Schedule version</span>
          <strong>{systemStatus?.scheduleVersion ?? "-"}</strong>
        </article>
        <article>
          <span>Playlist version</span>
          <strong>{systemStatus?.playlistVersion ?? "-"}</strong>
        </article>
        <article>
          <span>Media library</span>
          <strong>{systemStatus?.mediaCount ?? "-"} item(s)</strong>
        </article>
        <article>
          <span>Last agent sync</span>
          <strong>{agentStatus?.lastSync ?? "not yet synced"}</strong>
        </article>
        <article>
          <span>Agent schedule</span>
          <strong>{agentStatus?.currentScheduleVersion ?? "-"}</strong>
        </article>
        <article>
          <span>Agent readiness</span>
          <strong>{agentStatus?.readinessState ?? agentStatus?.syncStatus ?? "-"}</strong>
        </article>
        <article>
          <span>Pending schedule</span>
          <strong>{agentStatus?.pendingScheduleVersion ?? "-"}</strong>
        </article>
        <article>
          <span>Agent cached files</span>
          <strong>{agentStatus?.cachedFiles ?? "-"}</strong>
        </article>
        <article>
          <span>Failed media</span>
          <strong>
            {agentStatus?.failedMedia && agentStatus.failedMedia.length > 0
              ? agentStatus.failedMedia.map((item) => item.file).join(", ")
              : agentStatus?.lastError ?? "-"}
          </strong>
        </article>
        <article>
          <span>Player cache</span>
          <strong>{playerCache?.cachedFiles ?? "-"} file(s)</strong>
        </article>
      </div>
    </section>
  );
}
