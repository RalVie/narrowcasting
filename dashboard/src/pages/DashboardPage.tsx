import { useEffect, useMemo, useState } from "react";
import { apiUrl, promptForDashboardAdminKey } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { Campaign } from "../campaignTypes";
import type { MediaItem } from "../mediaTypes";
import type { ScreenRecord } from "../screenTypes";
import type { AgentStatus, PlayerCacheStatus, SystemStatus } from "../statusTypes";

const refreshIntervalMs = 10_000;

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

interface DashboardData {
  screens: ScreenRecord[];
  systemStatus: SystemStatus | null;
  agentStatus: AgentStatus | null;
  playerCache: PlayerCacheStatus | null;
  media: MediaItem[];
  campaigns: Campaign[];
  auditEvents: AuditEvent[];
}

type CardState = "healthy" | "warning" | "error" | "locked";

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
    return "Error";
  }

  if (state === "locked") {
    return "Locked";
  }

  return "Warning";
}

function latestCampaign(campaigns: Campaign[]) {
  return [...campaigns].sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))[0] ?? null;
}

function DashboardCard({
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

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    screens: [],
    systemStatus: null,
    agentStatus: null,
    playerCache: null,
    media: [],
    campaigns: [],
    auditEvents: []
  });
  const [status, setStatus] = useState("Loading dashboard...");
  const [isLocked, setIsLocked] = useState(false);

  async function loadDashboard() {
    try {
      const [screensResponse, systemResponse, agentResponse, cacheResponse, mediaResponse, campaignResponse, auditResponse] =
        await Promise.all([
          fetch(apiUrl("/api/screens")),
          fetch(apiUrl("/api/status")),
          fetch(apiUrl("/api/agent-status")),
          fetch(apiUrl("/api/player-cache")),
          fetch(apiUrl("/api/media")),
          fetch(apiUrl("/api/campaigns")),
          fetch(apiUrl("/api/audit?limit=5"))
        ]);

      const responses = [screensResponse, systemResponse, agentResponse, cacheResponse, mediaResponse, campaignResponse, auditResponse];

      if (responses.some((response) => response.status === 401 || response.status === 503)) {
        setIsLocked(true);
        setStatus("Dashboard is locked. Enter the admin key to load operational status.");
        return;
      }

      const failedResponse = responses.find((response) => !response.ok);

      if (failedResponse) {
        throw new Error(await readApiError(failedResponse));
      }

      const auditBody = (await auditResponse.json()) as { events?: AuditEvent[] };

      setData({
        screens: (await screensResponse.json()) as ScreenRecord[],
        systemStatus: (await systemResponse.json()) as SystemStatus,
        agentStatus: (await agentResponse.json()) as AgentStatus,
        playerCache: (await cacheResponse.json()) as PlayerCacheStatus,
        media: (await mediaResponse.json()) as MediaItem[],
        campaigns: (await campaignResponse.json()) as Campaign[],
        auditEvents: Array.isArray(auditBody.events) ? auditBody.events : []
      });
      setIsLocked(false);
      setStatus("Dashboard refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load dashboard: ${error.message}` : "Unable to load dashboard.");
    }
  }

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, refreshIntervalMs);

    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const approvedScreens = data.screens.filter((screen) => screen.status === "approved");
    const onlineScreens = approvedScreens.filter((screen) => screen.connectionStatus === "online");
    const offlineScreens = approvedScreens.filter((screen) => screen.connectionStatus !== "online");
    const pendingScreens = data.screens.filter((screen) => screen.status === "pending");
    const failedMedia = data.agentStatus?.failedMedia ?? [];
    const enabledCampaigns = data.campaigns.filter((campaign) => campaign.enabled);
    const recentCampaign = latestCampaign(data.campaigns);
    const agentReady = data.agentStatus?.readinessState === "ready" || data.agentStatus?.syncStatus === "ready";

    return {
      approvedScreens,
      onlineScreens,
      offlineScreens,
      pendingScreens,
      failedMedia,
      enabledCampaigns,
      recentCampaign,
      agentReady
    };
  }, [data]);

  const screenState: CardState = isLocked ? "locked" : summary.offlineScreens.length > 0 || summary.pendingScreens.length > 0 ? "warning" : "healthy";
  const syncState: CardState =
    isLocked ? "locked" : summary.failedMedia.length > 0 ? "error" : summary.agentReady ? "healthy" : "warning";
  const publishingState: CardState = isLocked ? "locked" : summary.enabledCampaigns.length > 0 ? "healthy" : "warning";
  const mediaState: CardState = isLocked ? "locked" : data.media.length > 0 ? "healthy" : "warning";

  return (
    <section className="page-section" id="dashboard">
      <div className="section-header">
        <div>
          <h2>Dashboard</h2>
          <p>Operational home for screens, publishing, synchronization, and recent activity.</p>
        </div>
        <button onClick={() => void loadDashboard()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      {isLocked ? (
        <section className="operator-panel dashboard-locked-panel">
          <div>
            <h3>Admin access required</h3>
            <p>Enter the admin key to view operational status, publishing data, media counts, and audit activity.</p>
          </div>
          <button
            onClick={() => {
              promptForDashboardAdminKey();
              void loadDashboard();
            }}
            type="button"
          >
            Enter Admin Key
          </button>
        </section>
      ) : null}

      <div className="dashboard-grid">
        <DashboardCard action={{ href: "#screens", label: "View Screens" }} state={screenState} title="Screens" value={`${summary.onlineScreens.length}/${summary.approvedScreens.length} online`}>
          <span>{data.screens.length} total</span>
          <span>{summary.offlineScreens.length} offline</span>
          <span>{summary.pendingScreens.length} pending approval</span>
        </DashboardCard>

        <DashboardCard action={{ href: "#system-status", label: "Open System Status" }} state={syncState} title="Playback / Sync" value={data.agentStatus?.readinessState ?? data.agentStatus?.syncStatus ?? "unknown"}>
          <span>Last sync: {formatDateTime(data.agentStatus?.lastSync)}</span>
          <span>Pending schedule: {data.agentStatus?.pendingScheduleVersion ?? "-"}</span>
          <span>Failed media: {summary.failedMedia.length}</span>
        </DashboardCard>

        <DashboardCard action={{ href: "#campaigns", label: "Publish Campaign" }} state={publishingState} title="Publishing" value={`${summary.enabledCampaigns.length} enabled`}>
          <span>Campaigns: {data.campaigns.length}</span>
          <span>Latest: {summary.recentCampaign?.name ?? "-"}</span>
          <span>Updated: {formatDateTime(summary.recentCampaign?.updatedAt)}</span>
        </DashboardCard>

        <DashboardCard action={{ href: "#media-library", label: "Open Media Library" }} state={mediaState} title="Storage / Media" value={`${data.media.length} media items`}>
          <span>Server media: {data.systemStatus?.mediaCount ?? data.media.length}</span>
          <span>Agent cached files: {data.agentStatus?.cachedFiles ?? "-"}</span>
          <span>Player cache: {data.playerCache?.cachedFiles ?? "-"} files</span>
        </DashboardCard>
      </div>

      <section className="dashboard-actions operator-panel">
        <div className="operator-panel-header">
          <h3>Next Actions</h3>
          <span>Common paths</span>
        </div>
        <div className="dashboard-action-row">
          <a href="#screens">View Screens</a>
          <a href="#campaigns">Publish Campaign</a>
          <a href="#system-status">Open System Status</a>
          <a href="#audit">View Audit</a>
          <a href="#scheduler-diagnostics">Open Support Diagnostics</a>
        </div>
      </section>

      <section className="operator-panel">
        <div className="operator-panel-header">
          <h3>Recent Activity</h3>
          <span>{data.auditEvents.length}</span>
        </div>
        {data.auditEvents.length === 0 ? (
          <p className="operator-empty">{isLocked ? "Unlock admin access to view recent activity." : "No recent audit activity."}</p>
        ) : (
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
        )}
      </section>
    </section>
  );
}
