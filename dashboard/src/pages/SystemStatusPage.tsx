import { useEffect, useMemo, useState } from "react";
import { apiUrl, promptForDashboardAdminKey } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { Campaign } from "../campaignTypes";
import type { MediaItem } from "../mediaTypes";
import type { ScreenRecord } from "../screenTypes";
import type { AgentStatus, PlayerCacheStatus, SystemStatus } from "../statusTypes";

const refreshIntervalMs = 10_000;
type MonitorFilter = "all" | "healthy" | "warning" | "attention";
type CardState = "healthy" | "warning" | "error" | "locked";

interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  objectType: string;
  objectName?: string | null;
  objectId?: string | null;
  result: "success" | "failure";
  reason?: string | null;
}

interface MonitoringData {
  screens: ScreenRecord[];
  systemStatus: SystemStatus | null;
  agentStatus: AgentStatus | null;
  playerCache: PlayerCacheStatus | null;
  media: MediaItem[];
  campaigns: Campaign[];
  auditEvents: AuditEvent[];
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "-";
}

function stateLabel(state: CardState) {
  if (state === "healthy") {
    return "Healthy";
  }

  if (state === "error") {
    return "Attention Required";
  }

  if (state === "locked") {
    return "Locked";
  }

  return "Warning";
}

function latestCampaign(campaigns: Campaign[]) {
  return [...campaigns].sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))[0] ?? null;
}

function shortRevision(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "-";
}

function MonitoringCard({
  action,
  children,
  state,
  title,
  value
}: {
  action?: { href: string; label: string };
  children: React.ReactNode;
  state: CardState;
  title: string;
  value: string;
}) {
  return (
    <article className={`dashboard-card ${state}`}>
      <div className="dashboard-card-header">
        <span>{title}</span>
        <strong>{stateLabel(state)}</strong>
      </div>
      <p className="dashboard-card-value">{value}</p>
      <div className="dashboard-card-detail">{children}</div>
      {action ? (
        <a className="dashboard-card-action" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </article>
  );
}

export function SystemStatusPage() {
  const [data, setData] = useState<MonitoringData>({
    screens: [],
    systemStatus: null,
    agentStatus: null,
    playerCache: null,
    media: [],
    campaigns: [],
    auditEvents: []
  });
  const [status, setStatus] = useState("Loading monitoring status...");
  const [isLocked, setIsLocked] = useState(false);
  const [filter, setFilter] = useState<MonitorFilter>("all");

  async function loadStatus() {
    try {
      const [screenResponse, systemResponse, agentResponse, cacheResponse, mediaResponse, campaignResponse, auditResponse] =
        await Promise.all([
          fetch(apiUrl("/api/screens")),
          fetch(apiUrl("/api/status")),
          fetch(apiUrl("/api/agent-status")),
          fetch(apiUrl("/api/player-cache")),
          fetch(apiUrl("/api/media")),
          fetch(apiUrl("/api/campaigns")),
          fetch(apiUrl("/api/audit?limit=8"))
        ]);

      const responses = [screenResponse, systemResponse, agentResponse, cacheResponse, mediaResponse, campaignResponse, auditResponse];

      if (responses.some((response) => response.status === 401 || response.status === 503)) {
        setIsLocked(true);
        setStatus("Monitoring is locked. Enter the admin key to view operational health.");
        return;
      }

      const failedResponse = responses.find((response) => !response.ok);

      if (failedResponse) {
        throw new Error(await readApiError(failedResponse));
      }

      const auditBody = (await auditResponse.json()) as { events?: AuditEvent[] };

      setData({
        screens: (await screenResponse.json()) as ScreenRecord[],
        systemStatus: (await systemResponse.json()) as SystemStatus,
        agentStatus: (await agentResponse.json()) as AgentStatus,
        playerCache: (await cacheResponse.json()) as PlayerCacheStatus,
        media: (await mediaResponse.json()) as MediaItem[],
        campaigns: (await campaignResponse.json()) as Campaign[],
        auditEvents: Array.isArray(auditBody.events) ? auditBody.events : []
      });
      setIsLocked(false);
      setStatus("Monitoring refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load monitoring: ${error.message}` : "Unable to load monitoring.");
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

  const summary = useMemo(() => {
    const approvedScreens = data.screens.filter((screen) => screen.status === "approved");
    const onlineScreens = approvedScreens.filter((screen) => screen.connectionStatus === "online");
    const offlineScreens = approvedScreens.filter((screen) => screen.connectionStatus !== "online");
    const pendingScreens = data.screens.filter((screen) => screen.status === "pending");
    const attentionScreens = approvedScreens.filter(
      (screen) => screen.healthStatus === "warning" || Boolean(screen.heartbeat?.playbackError)
    );
    const failedMedia = data.agentStatus?.failedMedia ?? [];
    const enabledCampaigns = data.campaigns.filter((campaign) => campaign.enabled);
    const recentCampaign = latestCampaign(data.campaigns);
    const agentReady = data.agentStatus?.readinessState === "ready" || data.agentStatus?.syncStatus === "ready";
    const pendingSchedule = data.agentStatus?.pendingScheduleVersion ?? null;
    const playersBehind = approvedScreens.filter(
      (screen) =>
        screen.connectionStatus === "online" &&
        (screen.heartbeat?.syncStatus === "pending" ||
          screen.heartbeat?.syncStatus === "waiting_for_media" ||
          Boolean(screen.heartbeat?.playbackError))
    );
    const publishEvents = data.auditEvents.filter((event) => event.action.toLowerCase().includes("publish"));

    return {
      approvedScreens,
      onlineScreens,
      offlineScreens,
      pendingScreens,
      attentionScreens,
      failedMedia,
      enabledCampaigns,
      recentCampaign,
      agentReady,
      pendingSchedule,
      playersBehind,
      publishEvents
    };
  }, [data]);

  const overallState: CardState =
    isLocked
      ? "locked"
      : summary.offlineScreens.length > 0 || summary.failedMedia.length > 0 || summary.attentionScreens.length > 0
        ? "error"
        : summary.pendingScreens.length > 0 || !summary.agentReady || summary.pendingSchedule !== null
          ? "warning"
          : "healthy";
  const screenState: CardState =
    isLocked ? "locked" : summary.offlineScreens.length > 0 || summary.pendingScreens.length > 0 ? "warning" : "healthy";
  const syncState: CardState =
    isLocked ? "locked" : summary.failedMedia.length > 0 ? "error" : summary.agentReady && summary.pendingSchedule === null ? "healthy" : "warning";
  const publishingState: CardState = isLocked ? "locked" : summary.recentCampaign ? "healthy" : "warning";
  const storageState: CardState = isLocked ? "locked" : data.media.length > 0 ? "healthy" : "warning";

  const showHealthy = filter === "all" || filter === "healthy";
  const showWarnings = filter === "all" || filter === "warning";
  const showAttention = filter === "all" || filter === "attention";

  return (
    <section className="page-section" id="system-status">
      <div className="section-header">
        <div>
          <h2>Monitoring</h2>
          <p>Operational health for screens, publishing, synchronization, storage, and recent activity.</p>
        </div>
        <button onClick={() => void loadStatus()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      {isLocked ? (
        <section className="operator-panel dashboard-locked-panel">
          <div>
            <h3>Admin access required</h3>
            <p>Enter the admin key to view monitoring data and recent operational activity.</p>
          </div>
          <button
            onClick={() => {
              promptForDashboardAdminKey();
              void loadStatus();
            }}
            type="button"
          >
            Enter Admin Key
          </button>
        </section>
      ) : null}

      <div className="operator-filter-row monitoring-filter-row" role="group" aria-label="Monitoring filter">
        {[
          ["all", "All"],
          ["healthy", "Healthy"],
          ["warning", "Warnings"],
          ["attention", "Attention"]
        ].map(([value, label]) => (
          <button
            className={filter === value ? "operator-chip active" : "operator-chip"}
            key={value}
            onClick={() => setFilter(value as MonitorFilter)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <section className="monitoring-section">
        <div className="operator-panel-header">
          <h3>Health Overview</h3>
          <span>{stateLabel(overallState)}</span>
        </div>
        <div className="dashboard-grid">
          <MonitoringCard state={overallState} title="Overall Health" value={stateLabel(overallState)}>
            <span>Server: {data.systemStatus?.server ?? "unknown"}</span>
            <span>{summary.attentionScreens.length} screen(s) need attention</span>
            <span>{summary.failedMedia.length} failed media download(s)</span>
          </MonitoringCard>

          <MonitoringCard action={{ href: "#screens", label: "View Screens" }} state={screenState} title="Screens" value={`${summary.onlineScreens.length}/${summary.approvedScreens.length} online`}>
            <span>{summary.offlineScreens.length} offline</span>
            <span>{summary.pendingScreens.length} pending approval</span>
            <span>{summary.attentionScreens.length} attention</span>
          </MonitoringCard>

          <MonitoringCard action={{ href: "#campaigns", label: "Open Campaigns" }} state={publishingState} title="Publishing" value={summary.recentCampaign?.name ?? "No publish yet"}>
            <span>{summary.enabledCampaigns.length} enabled campaign(s)</span>
            <span>Latest: {formatDateTime(summary.recentCampaign?.updatedAt)}</span>
            <span>Current revision: {shortRevision(summary.recentCampaign?.revision)}</span>
          </MonitoringCard>

          <MonitoringCard action={{ href: "#system-status", label: "Refresh Monitoring" }} state={syncState} title="Synchronization" value={data.agentStatus?.readinessState ?? data.agentStatus?.syncStatus ?? "unknown"}>
            <span>Last sync: {formatDateTime(data.agentStatus?.lastSync)}</span>
            <span>Pending sync: {data.agentStatus?.pendingScheduleVersion ?? "-"}</span>
            <span>Players behind: {summary.playersBehind.length}</span>
          </MonitoringCard>

          <MonitoringCard action={{ href: "#media-library", label: "Open Media Library" }} state={storageState} title="Storage" value={`${data.media.length} media items`}>
            <span>Server media: {data.systemStatus?.mediaCount ?? data.media.length}</span>
            <span>Player cache: {data.playerCache?.cachedFiles ?? "-"} files</span>
            <span>Agent cache: {data.agentStatus?.cachedFiles ?? "-"} files</span>
          </MonitoringCard>
        </div>
      </section>

      <div className="monitoring-workspace-grid">
        {(showAttention || showWarnings) && (
          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Deployment</h3>
              <span>{summary.offlineScreens.length + summary.pendingScreens.length} item(s)</span>
            </div>
            {summary.offlineScreens.length === 0 && summary.pendingScreens.length === 0 ? (
              <p className="operator-empty">No offline screens or pending approvals.</p>
            ) : null}
            <div className="monitoring-list">
              {summary.offlineScreens.map((screen) => (
                <a className="monitoring-list-item attention" href="#screens" key={screen.screenId}>
                  <strong>{screen.name}</strong>
                  <span>Offline / last heartbeat {formatDateTime(screen.lastSeen)}</span>
                </a>
              ))}
              {summary.pendingScreens.map((screen) => (
                <a className="monitoring-list-item warning" href="#screens" key={screen.screenId}>
                  <strong>{screen.name}</strong>
                  <span>Pending approval / {screen.hostname}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {(showAttention || showWarnings || showHealthy) && (
          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Synchronization</h3>
              <span>{summary.playersBehind.length} behind</span>
            </div>
            {summary.playersBehind.length === 0 && summary.failedMedia.length === 0 ? (
              <p className="operator-empty">Players appear synchronized.</p>
            ) : null}
            <div className="monitoring-list">
              {summary.playersBehind.map((screen) => (
                <a className="monitoring-list-item warning" href="#screens" key={screen.screenId}>
                  <strong>{screen.name}</strong>
                  <span>
                    {screen.heartbeat?.syncStatus ?? "Sync pending"} / revision {shortRevision(screen.heartbeat?.lastScheduleSignature)}
                  </span>
                </a>
              ))}
              {summary.failedMedia.map((item) => (
                <a className="monitoring-list-item attention" href="#system-status" key={item.file}>
                  <strong>{item.file}</strong>
                  <span>{item.error ?? "Media download failed"}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {(showWarnings || showHealthy) && (
          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Publishing</h3>
              <span>{summary.publishEvents.length} recent</span>
            </div>
            {summary.publishEvents.length === 0 ? <p className="operator-empty">No recent publish events.</p> : null}
            <div className="monitoring-list">
              {summary.publishEvents.slice(0, 5).map((event) => (
                <a className={event.result === "success" ? "monitoring-list-item healthy" : "monitoring-list-item attention"} href="#campaigns" key={event.id}>
                  <strong>{event.objectName ?? event.objectId ?? "Campaign"}</strong>
                  <span>
                    {event.result} / {formatDateTime(event.timestamp)}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {(showWarnings || showHealthy) && (
          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Storage</h3>
              <span>{data.playerCache?.cachedFiles ?? 0} cached</span>
            </div>
            <div className="monitoring-list">
              <a className="monitoring-list-item healthy" href="#media-library">
                <strong>Media Library</strong>
                <span>{data.systemStatus?.mediaCount ?? data.media.length} server media item(s)</span>
              </a>
              <a className="monitoring-list-item healthy" href="#system-status">
                <strong>Player Cache</strong>
                <span>{data.playerCache?.cachedFiles ?? "-"} cached file(s)</span>
              </a>
              <a className="monitoring-list-item healthy" href="#system-status">
                <strong>Agent Cache</strong>
                <span>{data.agentStatus?.cachedFiles ?? "-"} cached file(s)</span>
              </a>
            </div>
          </section>
        )}
      </div>

      <section className="operator-panel monitoring-recent-activity">
        <div className="operator-panel-header">
          <h3>Recent Activity</h3>
          <span>{data.auditEvents.length}</span>
        </div>
        {data.auditEvents.length === 0 ? <p className="operator-empty">No recent activity.</p> : null}
        {data.auditEvents.length > 0 ? (
          <div className="audit-event-list">
            {data.auditEvents.map((event) => (
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
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}
