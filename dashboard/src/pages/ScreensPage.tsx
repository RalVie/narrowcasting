import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;
const onlineWindowMs = 45_000;

function isOnline(screen: ScreenRecord) {
  const lastSeen = Date.parse(screen.lastSeen);
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < onlineWindowMs;
}

function formatLastSeen(value: string) {
  const lastSeen = Date.parse(value);

  if (!Number.isFinite(lastSeen)) {
    return "never";
  }

  return new Date(lastSeen).toLocaleString();
}

export function ScreensPage() {
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
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

  async function loadScreens() {
    try {
      const response = await fetch(apiUrl("/api/screens"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as ScreenRecord[];
      setScreens(body);
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

  function renderScreenCard(screen: ScreenRecord, pending = false) {
    return (
      <article className="screen-card" key={screen.screenId}>
        <div className="screen-card-header">
          <div>
            <strong>{screen.name}</strong>
            <span>{screen.status}</span>
          </div>
          <span className={isOnline(screen) ? "screen-online" : "screen-offline"}>
            {isOnline(screen) ? "online" : "offline"}
          </span>
        </div>
        <label>
          Screen name
          <input
            onChange={(event) =>
              setScreenNames((names) => ({
                ...names,
                [screen.screenId]: event.target.value
              }))
            }
            value={screenNames[screen.screenId] ?? screen.name}
          />
        </label>
        <dl className="screen-meta">
          <dt>Player ID</dt>
          <dd>{screen.playerId}</dd>
          <dt>Hostname</dt>
          <dd>{screen.hostname}</dd>
          <dt>Resolution</dt>
          <dd>{screen.resolution}</dd>
          <dt>Orientation</dt>
          <dd>{screen.orientation}</dd>
          <dt>Version</dt>
          <dd>{screen.version}</dd>
          <dt>Last seen</dt>
          <dd>{formatLastSeen(screen.lastSeen)}</dd>
        </dl>
        <div className="button-row">
          {pending ? (
            <button disabled={isBusy} onClick={() => void approveScreen(screen.screenId)} type="button">
              Approve
            </button>
          ) : (
            <button disabled={isBusy} onClick={() => void renameScreen(screen.screenId)} type="button">
              Rename
            </button>
          )}
        </div>
      </article>
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
        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>Pending Players</h3>
            <span>{pendingScreens.length}</span>
          </div>
          <div className="screen-card-list">
            {pendingScreens.length === 0 ? <p className="operator-empty">No pending players.</p> : null}
            {pendingScreens.map((screen) => renderScreenCard(screen, true))}
          </div>
        </section>

        <section className="operator-panel">
          <div className="operator-panel-header">
            <h3>Approved Screens</h3>
            <span>{approvedScreens.length}</span>
          </div>
          <div className="screen-card-list">
            {approvedScreens.length === 0 ? <p className="operator-empty">No approved screens yet.</p> : null}
            {approvedScreens.map((screen) => renderScreenCard(screen))}
          </div>
        </section>
      </div>
    </section>
  );
}
