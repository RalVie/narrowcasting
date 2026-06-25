import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "-";
}

function formatUptime(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatNullable(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function getHealthLabel(screen: ScreenRecord) {
  if (screen.healthStatus === "offline") {
    return "Offline";
  }

  if (screen.healthStatus === "warning") {
    return "Warning";
  }

  return screen.connectionStatus === "online" ? "Online" : "Offline";
}

function getHealthClass(screen: ScreenRecord) {
  if (screen.healthStatus === "warning") {
    return "screen-warning";
  }

  return screen.connectionStatus === "online" ? "screen-online" : "screen-offline";
}

export function ScreensPage() {
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading screens...");
  const [isBusy, setIsBusy] = useState(false);
  const [screenNames, setScreenNames] = useState<Record<string, string>>({});

  const pendingScreens = useMemo(
    () => screens.filter((screen) => screen.status === "pending"),
    [screens]
  );
  const approvedScreens = useMemo(
    () => screens.filter((screen) => screen.status === "approved"),
    [screens]
  );
  const selectedScreen = screens.find((screen) => screen.screenId === selectedScreenId) ?? approvedScreens[0] ?? pendingScreens[0];

  async function loadScreens() {
    try {
      const response = await fetch(apiUrl("/api/screens"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as ScreenRecord[];
      setScreens(body);
      setSelectedScreenId((currentId) => currentId ?? body[0]?.screenId ?? null);
      setScreenNames((names) => ({
        ...Object.fromEntries(body.map((screen) => [screen.screenId, screen.name])),
        ...names
      }));
      setStatus("Screens refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load screens: ${error.message}` : "Unable to load screens.");
    }
  }

  async function approveScreen(screenId: string) {
    setIsBusy(true);
    setStatus("Approving screen...");

    try {
      const name = screenNames[screenId]?.trim();

      if (name) {
        await renameScreen(screenId, name, true);
      }

      const response = await fetch(apiUrl(`/api/screens/${encodeURIComponent(screenId)}/approve`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus("Screen approved.");
      setSelectedScreenId(screenId);
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Approve failed: ${error.message}` : "Approve failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function renameScreen(screenId: string, name = screenNames[screenId], keepBusy = false) {
    if (!keepBusy) {
      setIsBusy(true);
      setStatus("Renaming screen...");
    }

    try {
      const response = await fetch(apiUrl(`/api/screens/${encodeURIComponent(screenId)}/rename`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!keepBusy) {
        setStatus("Screen renamed.");
        await loadScreens();
      }
    } catch (error) {
      if (!keepBusy) {
        setStatus(error instanceof Error ? `Rename failed: ${error.message}` : "Rename failed.");
      }
      throw error;
    } finally {
      if (!keepBusy) {
        setIsBusy(false);
      }
    }
  }

  useEffect(() => {
    void loadScreens();
    const timer = window.setInterval(() => {
      void loadScreens();
    }, refreshIntervalMs);

    return () => window.clearInterval(timer);
  }, []);

  function renderNameEditor(screen: ScreenRecord) {
    return (
      <div className="screen-name-editor">
        <input
          aria-label={`Screen name for ${screen.name}`}
          onChange={(event) =>
            setScreenNames((names) => ({
              ...names,
              [screen.screenId]: event.target.value
            }))
          }
          value={screenNames[screen.screenId] ?? screen.name}
        />
        {screen.status === "pending" ? (
          <button disabled={isBusy} onClick={() => void approveScreen(screen.screenId)} type="button">
            Approve
          </button>
        ) : (
          <button disabled={isBusy} onClick={() => void renameScreen(screen.screenId)} type="button">
            Rename
          </button>
        )}
      </div>
    );
  }

  function renderScreenRow(screen: ScreenRecord) {
    return (
      <tr key={screen.screenId}>
        <td>
          <span className={getHealthClass(screen)}>? {getHealthLabel(screen)}</span>
        </td>
        <td>{renderNameEditor(screen)}</td>
        <td>{screen.hostname}</td>
        <td>{formatNullable(screen.heartbeat?.networkIp)}</td>
        <td>{formatNullable(screen.heartbeat?.currentProgram)}</td>
        <td>{formatNullable(screen.heartbeat?.currentPlaylist)}</td>
        <td>{formatNullable(screen.heartbeat?.currentMedia)}</td>
        <td>{screen.heartbeat?.softwareVersion ?? screen.version}</td>
        <td>{formatDateTime(screen.heartbeat?.lastScheduleSync)}</td>
        <td>{formatDateTime(screen.lastSeen)}</td>
        <td>{formatUptime(screen.heartbeat?.uptime)}</td>
        <td>
          <button onClick={() => setSelectedScreenId(screen.screenId)} type="button">
            Details
          </button>
        </td>
      </tr>
    );
  }

  function renderDetails(screen: ScreenRecord | undefined) {
    if (!screen) {
      return <p className="operator-empty">No screen selected.</p>;
    }

    return (
      <div className="screen-detail-grid">
        <section className="screen-detail-section">
          <h3>General</h3>
          <dl className="screen-meta">
            <dt>Screen Name</dt>
            <dd>{screen.name}</dd>
            <dt>Screen ID</dt>
            <dd>{screen.screenId}</dd>
            <dt>Player ID</dt>
            <dd>{screen.playerId}</dd>
            <dt>Hostname</dt>
            <dd>{screen.hostname}</dd>
            <dt>Software Version</dt>
            <dd>{screen.heartbeat?.softwareVersion ?? screen.version}</dd>
            <dt>Registration Date</dt>
            <dd>{formatDateTime(screen.registeredAt)}</dd>
          </dl>
        </section>

        <section className="screen-detail-section">
          <h3>Playback</h3>
          <dl className="screen-meta">
            <dt>Current Program</dt>
            <dd>{formatNullable(screen.heartbeat?.currentProgram)}</dd>
            <dt>Current Playlist</dt>
            <dd>{formatNullable(screen.heartbeat?.currentPlaylist)}</dd>
            <dt>Current Media</dt>
            <dd>{formatNullable(screen.heartbeat?.currentMedia)}</dd>
            <dt>Media Type</dt>
            <dd>{formatNullable(screen.heartbeat?.currentMediaType)}</dd>
            <dt>Play State</dt>
            <dd>{formatNullable(screen.heartbeat?.playState)}</dd>
            <dt>Last Schedule Signature</dt>
            <dd>{formatNullable(screen.heartbeat?.lastScheduleSignature)}</dd>
          </dl>
        </section>

        <section className="screen-detail-section">
          <h3>System</h3>
          <dl className="screen-meta">
            <dt>IP Address</dt>
            <dd>{formatNullable(screen.heartbeat?.networkIp)}</dd>
            <dt>Resolution</dt>
            <dd>{screen.heartbeat?.resolution ?? screen.resolution}</dd>
            <dt>Orientation</dt>
            <dd>{screen.heartbeat?.orientation ?? screen.orientation}</dd>
            <dt>Memory</dt>
            <dd>{screen.heartbeat?.memoryUsage ? `${screen.heartbeat.memoryUsage} MB` : "-"}</dd>
            <dt>Disk Free</dt>
            <dd>{formatNullable(screen.heartbeat?.diskFree)}</dd>
            <dt>CPU</dt>
            <dd>{formatNullable(screen.heartbeat?.cpuUsage)}</dd>
            <dt>Uptime</dt>
            <dd>{formatUptime(screen.heartbeat?.uptime)}</dd>
          </dl>
        </section>
      </div>
    );
  }

  return (
    <section className="page-section" id="screens">
      <div className="section-heading">
        <div>
          <h2>Screens</h2>
          <p>Approve Raspberry Pi players and monitor registered local screens.</p>
        </div>
        <button disabled={isBusy} onClick={() => void loadScreens()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      <div className="screen-registry-grid">
        <section className="operator-panel screen-table-panel">
          <div className="operator-panel-header">
            <h3>Pending Players</h3>
            <span>{pendingScreens.length}</span>
          </div>
          {pendingScreens.length === 0 ? <p className="operator-empty">No pending players.</p> : null}
          {pendingScreens.length > 0 ? (
            <div className="screen-table-wrap">
              <table className="screen-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Screen Name</th>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>Current Program</th>
                    <th>Current Playlist</th>
                    <th>Current Media</th>
                    <th>Player Version</th>
                    <th>Last Schedule Sync</th>
                    <th>Last Seen</th>
                    <th>Uptime</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>{pendingScreens.map(renderScreenRow)}</tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="operator-panel screen-table-panel">
          <div className="operator-panel-header">
            <h3>Approved Screens</h3>
            <span>{approvedScreens.length}</span>
          </div>
          {approvedScreens.length === 0 ? <p className="operator-empty">No approved screens yet.</p> : null}
          {approvedScreens.length > 0 ? (
            <div className="screen-table-wrap">
              <table className="screen-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Screen Name</th>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>Current Program</th>
                    <th>Current Playlist</th>
                    <th>Current Media</th>
                    <th>Player Version</th>
                    <th>Last Schedule Sync</th>
                    <th>Last Seen</th>
                    <th>Uptime</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>{approvedScreens.map(renderScreenRow)}</tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      <section className="operator-panel screen-details-panel">
        <div className="operator-panel-header">
          <h3>Details</h3>
          <span>{selectedScreen?.name ?? "No screen"}</span>
        </div>
        {renderDetails(selectedScreen)}
      </section>
    </section>
  );
}