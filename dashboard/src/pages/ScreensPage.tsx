import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { Campaign } from "../campaignTypes";
import type { ScreenGroup, ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;
type ScreenFilter = "all" | "online" | "offline" | "pending" | "attention";

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
  if (screen.status === "pending") {
    return "Pending Approval";
  }

  if (screen.healthStatus === "offline") {
    return "Offline";
  }

  if (screen.healthStatus === "warning") {
    return "Needs Attention";
  }

  return screen.connectionStatus === "online" ? "Online" : "Offline";
}

function getHealthClass(screen: ScreenRecord) {
  if (screen.status === "pending") {
    return "screen-pending";
  }

  if (screen.healthStatus === "warning") {
    return "screen-attention";
  }

  return screen.connectionStatus === "online" ? "screen-online" : "screen-offline";
}

function shortRevision(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "-";
}

function schedulePreviewHref(screenId: string) {
  return `#schedule-preview?screenId=${encodeURIComponent(screenId)}`;
}

export function ScreensPage() {
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading screens...");
  const [isBusy, setIsBusy] = useState(false);
  const [screenNames, setScreenNames] = useState<Record<string, string>>({});
  const [screenGroups, setScreenGroups] = useState<ScreenGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [screenFilter, setScreenFilter] = useState<ScreenFilter>("all");
  const [screenSearch, setScreenSearch] = useState("");
  const [groupDrafts, setGroupDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [groupAddScreen, setGroupAddScreen] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  const pendingScreens = useMemo(
    () => screens.filter((screen) => screen.status === "pending"),
    [screens]
  );
  const approvedScreens = useMemo(
    () => screens.filter((screen) => screen.status === "approved"),
    [screens]
  );
  const screensById = useMemo(
    () => new Map(screens.map((screen) => [screen.screenId, screen])),
    [screens]
  );
  const screenGroupsByScreenId = useMemo(() => {
    const groupsByScreen = new Map<string, ScreenGroup[]>();

    for (const group of screenGroups) {
      for (const screenId of group.screenIds) {
        groupsByScreen.set(screenId, [...(groupsByScreen.get(screenId) ?? []), group]);
      }
    }

    return groupsByScreen;
  }, [screenGroups]);
  const campaignsByScreenId = useMemo(() => {
    const campaignsByScreen = new Map<string, Campaign[]>();

    for (const campaign of campaigns) {
      if (campaign.targetType === "SCREEN") {
        for (const screenId of campaign.targetIds) {
          campaignsByScreen.set(screenId, [...(campaignsByScreen.get(screenId) ?? []), campaign]);
        }
        continue;
      }

      for (const groupId of campaign.targetIds) {
        const group = screenGroups.find((item) => item.groupId === groupId);

        for (const screenId of group?.screenIds ?? []) {
          campaignsByScreen.set(screenId, [...(campaignsByScreen.get(screenId) ?? []), campaign]);
        }
      }
    }

    return campaignsByScreen;
  }, [campaigns, screenGroups]);
  const filteredScreens = useMemo(() => {
    const query = screenSearch.trim().toLowerCase();

    return screens.filter((screen) => {
      const groups = screenGroupsByScreenId.get(screen.screenId) ?? [];
      const targetedCampaigns = campaignsByScreenId.get(screen.screenId) ?? [];
      const matchesSearch =
        query.length === 0 ||
        [
          screen.name,
          screen.hostname,
          screen.screenId,
          screen.heartbeat?.networkIp,
          ...groups.map((group) => group.name),
          ...targetedCampaigns.map((campaign) => campaign.name)
        ]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(query));

      if (!matchesSearch) {
        return false;
      }

      if (screenFilter === "online") {
        return screen.status === "approved" && screen.connectionStatus === "online";
      }

      if (screenFilter === "offline") {
        return screen.status === "approved" && screen.connectionStatus !== "online";
      }

      if (screenFilter === "pending") {
        return screen.status === "pending";
      }

      if (screenFilter === "attention") {
        return screen.healthStatus === "warning" || Boolean(screen.heartbeat?.playbackError);
      }

      return true;
    });
  }, [campaignsByScreenId, screenFilter, screenGroupsByScreenId, screenSearch, screens]);
  const selectedScreen = screens.find((screen) => screen.screenId === selectedScreenId) ?? approvedScreens[0] ?? pendingScreens[0];

  async function loadScreens() {
    try {
      const [screenResponse, groupResponse, campaignResponse] = await Promise.all([
        fetch(apiUrl("/api/screens")),
        fetch(apiUrl("/api/screen-groups")),
        fetch(apiUrl("/api/campaigns"))
      ]);

      if (!screenResponse.ok) {
        throw new Error(`screens HTTP ${screenResponse.status}`);
      }

      if (!groupResponse.ok) {
        throw new Error(`screen groups HTTP ${groupResponse.status}`);
      }

      if (!campaignResponse.ok) {
        throw new Error(`campaigns HTTP ${campaignResponse.status}`);
      }

      const screenBody = (await screenResponse.json()) as ScreenRecord[];
      const groupBody = (await groupResponse.json()) as ScreenGroup[];
      const campaignBody = (await campaignResponse.json()) as Campaign[];
      setScreens(screenBody);
      setScreenGroups(groupBody);
      setCampaigns(campaignBody);
      setSelectedScreenId((currentId) =>
        currentId && screenBody.some((screen) => screen.screenId === currentId)
          ? currentId
          : screenBody[0]?.screenId ?? null
      );
      setScreenNames((names) => ({
        ...Object.fromEntries(screenBody.map((screen) => [screen.screenId, screen.name])),
        ...names
      }));
      setGroupDrafts((drafts) => ({
        ...Object.fromEntries(
          groupBody.map((group) => [
            group.groupId,
            {
              name: group.name,
              description: group.description ?? ""
            }
          ])
        ),
        ...drafts
      }));
      setGroupAddScreen((selections) => ({
        ...Object.fromEntries(groupBody.map((group) => [group.groupId, selections[group.groupId] ?? ""])),
        ...selections
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

  async function promptRenameScreen(screen: ScreenRecord) {
    const nextName = window.prompt(`Rename screen "${screen.name}"`, screenNames[screen.screenId] ?? screen.name);

    if (nextName === null) {
      return;
    }

    const trimmedName = nextName.trim();

    if (!trimmedName) {
      setStatus("Screen name cannot be empty.");
      return;
    }

    setScreenNames((names) => ({
      ...names,
      [screen.screenId]: trimmedName
    }));
    await renameScreen(screen.screenId, trimmedName);
  }

  async function deleteScreen(screen: ScreenRecord) {
    if (
      !window.confirm(
        `Delete screen "${screen.name}"?\n\nThis removes the screen registration only. Assignments must be removed first.`
      )
    ) {
      return;
    }

    setIsBusy(true);
    setStatus("Deleting screen...");

    try {
      const response = await fetch(apiUrl(`/api/screens/${encodeURIComponent(screen.screenId)}/delete`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setSelectedScreenId((currentId) => (currentId === screen.screenId ? null : currentId));
      setStatus("Screen deleted.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete screen failed: ${error.message}` : "Delete screen failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createGroup() {
    setIsBusy(true);
    setStatus("Creating screen group...");

    try {
      const response = await fetch(apiUrl("/api/screen-groups"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: newGroupName.trim() || "New Group",
          description: newGroupDescription.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const group = (await response.json()) as ScreenGroup;
      setNewGroupName("");
      setNewGroupDescription("");
      setGroupDrafts((drafts) => ({
        ...drafts,
        [group.groupId]: {
          name: group.name,
          description: group.description ?? ""
        }
      }));
      setStatus("Screen group created.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Create group failed: ${error.message}` : "Create group failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function renameGroup(groupId: string) {
    setIsBusy(true);
    setStatus("Saving screen group...");

    try {
      const draft = groupDrafts[groupId];
      const response = await fetch(apiUrl(`/api/screen-groups/${encodeURIComponent(groupId)}/rename`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: draft?.name ?? "Unnamed Group",
          description: draft?.description?.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus("Screen group saved.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Save group failed: ${error.message}` : "Save group failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteGroup(group: ScreenGroup) {
    if (!window.confirm(`Delete screen group "${group.name}"? Screens will not be deleted.`)) {
      return;
    }

    setIsBusy(true);
    setStatus("Deleting screen group...");

    try {
      const response = await fetch(apiUrl(`/api/screen-groups/${encodeURIComponent(group.groupId)}/delete`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus("Screen group deleted.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete group failed: ${error.message}` : "Delete group failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function addScreenToGroup(groupId: string) {
    const screenId = groupAddScreen[groupId];

    if (!screenId) {
      setStatus("Choose an approved screen before adding it to the group.");
      return;
    }

    setIsBusy(true);
    setStatus("Adding screen to group...");

    try {
      const response = await fetch(apiUrl(`/api/screen-groups/${encodeURIComponent(groupId)}/screens/add`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ screenId })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setGroupAddScreen((selections) => ({
        ...selections,
        [groupId]: ""
      }));
      setStatus("Screen added to group.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Add screen failed: ${error.message}` : "Add screen failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function removeScreenFromGroup(groupId: string, screenId: string) {
    setIsBusy(true);
    setStatus("Removing screen from group...");

    try {
      const response = await fetch(apiUrl(`/api/screen-groups/${encodeURIComponent(groupId)}/screens/remove`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ screenId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus("Screen removed from group.");
      await loadScreens();
    } catch (error) {
      setStatus(error instanceof Error ? `Remove screen failed: ${error.message}` : "Remove screen failed.");
    } finally {
      setIsBusy(false);
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

  function renderAssignmentLink(screen: ScreenRecord) {
    if (screen.status !== "approved") {
      return <span>-</span>;
    }

    return (
      <a className="screen-assignment-link" href="#campaigns">
        Publish Campaign
      </a>
    );
  }

  function renderSchedulePreviewLink(screen: ScreenRecord) {
    if (screen.status !== "approved") {
      return <span>-</span>;
    }

    return (
      <a className="screen-assignment-link" href={schedulePreviewHref(screen.screenId)}>
        Preview this screen
      </a>
    );
  }

  function campaignSummary(screen: ScreenRecord) {
    const targetedCampaigns = campaignsByScreenId.get(screen.screenId) ?? [];
    const enabledCampaigns = targetedCampaigns.filter((campaign) => campaign.enabled);
    const visibleCampaigns = enabledCampaigns.length > 0 ? enabledCampaigns : targetedCampaigns;

    if (visibleCampaigns.length === 0) {
      return "No campaign target";
    }

    if (visibleCampaigns.length === 1) {
      return `${visibleCampaigns[0].name}${visibleCampaigns[0].enabled ? "" : " (disabled)"}`;
    }

    return `${visibleCampaigns[0].name} +${visibleCampaigns.length - 1}`;
  }

  function screenGroupSummary(screen: ScreenRecord) {
    const groups = screenGroupsByScreenId.get(screen.screenId) ?? [];
    return groups.length > 0 ? groups.map((group) => group.name).join(", ") : "No screen group";
  }

  function latestCampaignRevision(screen: ScreenRecord) {
    const targetedCampaigns = [...(campaignsByScreenId.get(screen.screenId) ?? [])].sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
    const revision = targetedCampaigns.find((campaign) => campaign.revision)?.revision;
    return shortRevision(revision);
  }

  function renderHealthBadge(screen: ScreenRecord) {
    return <span className={`screen-health-badge ${getHealthClass(screen)}`}>{getHealthLabel(screen)}</span>;
  }

  function renderScreenCard(screen: ScreenRecord) {
    return (
      <article className={selectedScreenId === screen.screenId ? "deployment-screen-card selected" : "deployment-screen-card"} key={screen.screenId}>
        <div className="deployment-screen-card-header">
          <div>
            <h3>{screen.name}</h3>
            <span>{screen.hostname}</span>
          </div>
          {renderHealthBadge(screen)}
        </div>

        <dl className="deployment-screen-summary">
          <dt>Last heartbeat</dt>
          <dd>{formatDateTime(screen.lastSeen)}</dd>
          <dt>Assigned campaign</dt>
          <dd>{campaignSummary(screen)}</dd>
          <dt>Screen group</dt>
          <dd>{screenGroupSummary(screen)}</dd>
          <dt>Last publish revision</dt>
          <dd>{latestCampaignRevision(screen)}</dd>
          <dt>Last synchronization</dt>
          <dd>{formatDateTime(screen.heartbeat?.lastScheduleSync)}</dd>
          <dt>Current schedule revision</dt>
          <dd>{shortRevision(screen.heartbeat?.lastScheduleSignature)}</dd>
          <dt>Currently running</dt>
          <dd>{formatNullable(screen.heartbeat?.currentProgram)}</dd>
        </dl>

        <div className="deployment-screen-card-actions">
          <button onClick={() => setSelectedScreenId(screen.screenId)} type="button">
            Details
          </button>
          {screen.status === "approved" ? (
            <a className="screen-assignment-link" href={schedulePreviewHref(screen.screenId)}>
              Preview Schedule
            </a>
          ) : null}
          {screen.status === "pending" ? (
            <button disabled={isBusy} onClick={() => void approveScreen(screen.screenId)} type="button">
              Approve
            </button>
          ) : (
            <button disabled={isBusy} onClick={() => void promptRenameScreen(screen)} type="button">
              Rename
            </button>
          )}
          <button disabled={isBusy} onClick={() => void deleteScreen(screen)} type="button">
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderDetails(screen: ScreenRecord | undefined) {
    if (!screen) {
      return <p className="operator-empty">No screen selected.</p>;
    }

    return (
      <div className="screen-detail-grid">
        <section className="screen-detail-section">
          <h3>Identity</h3>
          <dl className="screen-meta">
            <dt>Screen Name</dt>
            <dd>{screen.name}</dd>
            <dt>Edit Name</dt>
            <dd>{renderNameEditor(screen)}</dd>
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
          <h3>Deployment</h3>
          <dl className="screen-meta">
            <dt>Status</dt>
            <dd>{renderHealthBadge(screen)}</dd>
            <dt>Assigned Campaign</dt>
            <dd>{campaignSummary(screen)}</dd>
            <dt>Screen Group</dt>
            <dd>{screenGroupSummary(screen)}</dd>
            <dt>Assignment</dt>
            <dd>{renderAssignmentLink(screen)}</dd>
            <dt>Last Assignment</dt>
            <dd>{formatDateTime(screen.lastAssignment)}</dd>
            <dt>Last Publish Revision</dt>
            <dd>{latestCampaignRevision(screen)}</dd>
            <dt>Schedule Preview</dt>
            <dd>{renderSchedulePreviewLink(screen)}</dd>
          </dl>
        </section>

        <section className="screen-detail-section">
          <h3>Synchronization</h3>
          <dl className="screen-meta">
            <dt>Last Heartbeat</dt>
            <dd>{formatDateTime(screen.lastSeen)}</dd>
            <dt>Last Schedule Sync</dt>
            <dd>{formatDateTime(screen.heartbeat?.lastScheduleSync)}</dd>
            <dt>Sync Status</dt>
            <dd>{formatNullable(screen.heartbeat?.syncStatus)}</dd>
            <dt>Current Schedule Revision</dt>
            <dd>{shortRevision(screen.heartbeat?.lastScheduleSignature)}</dd>
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
          </dl>
        </section>

        <section className="screen-detail-section">
          <h3>Health</h3>
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
            <dt>Playback Error</dt>
            <dd>{formatNullable(screen.heartbeat?.playbackError)}</dd>
          </dl>
        </section>

        <section className="screen-detail-section">
          <h3>Actions</h3>
          <div className="screen-detail-actions">
            {screen.status === "pending" ? (
              <button disabled={isBusy} onClick={() => void approveScreen(screen.screenId)} type="button">
                Approve Screen
              </button>
            ) : (
              <button disabled={isBusy} onClick={() => void renameScreen(screen.screenId)} type="button">
                Save Name
              </button>
            )}
            <button disabled={isBusy} onClick={() => void deleteScreen(screen)} type="button">
              Delete Screen
            </button>
          </div>
          <dl className="screen-meta">
            <dt>Screen ID</dt>
            <dd>{screen.screenId}</dd>
          </dl>
        </section>
      </div>
    );
  }

  function renderGroup(group: ScreenGroup) {
    const draft = groupDrafts[group.groupId] ?? {
      name: group.name,
      description: group.description ?? ""
    };
    const memberScreens = group.screenIds.map((screenId) => screensById.get(screenId));
    const onlineCount = memberScreens.filter((screen) => screen?.connectionStatus === "online").length;
    const offlineCount = memberScreens.filter((screen) => !screen || screen.connectionStatus !== "online").length;
    const availableScreens = approvedScreens.filter((screen) => !group.screenIds.includes(screen.screenId));

    return (
      <article className="screen-group-card" key={group.groupId}>
        <div className="screen-group-header">
          <div>
            <h4>{group.name}</h4>
            <p>
              {group.screenIds.length} screens / {onlineCount} online / {offlineCount} offline
            </p>
          </div>
          <button disabled={isBusy} onClick={() => void deleteGroup(group)} type="button">
            Delete
          </button>
        </div>

        <div className="screen-group-edit">
          <label>
            Group name
            <input
              onChange={(event) =>
                setGroupDrafts((drafts) => ({
                  ...drafts,
                  [group.groupId]: {
                    ...draft,
                    name: event.target.value
                  }
                }))
              }
              value={draft.name}
            />
          </label>
          <label>
            Description
            <input
              onChange={(event) =>
                setGroupDrafts((drafts) => ({
                  ...drafts,
                  [group.groupId]: {
                    ...draft,
                    description: event.target.value
                  }
                }))
              }
              placeholder="Optional"
              value={draft.description}
            />
          </label>
          <button disabled={isBusy} onClick={() => void renameGroup(group.groupId)} type="button">
            Save Group
          </button>
        </div>

        <div className="screen-group-members">
          <h5>Members</h5>
          {group.screenIds.length === 0 ? <p className="operator-empty">No screens in this group.</p> : null}
          {group.screenIds.map((screenId) => {
            const screen = screensById.get(screenId);
            return (
              <div className="screen-group-member" key={screenId}>
                <span>
                  {screen?.name ?? "Unknown screen"}
                  <small>{screen ? getHealthLabel(screen) : "Missing or unapproved"}</small>
                </span>
                <button
                  disabled={isBusy}
                  onClick={() => void removeScreenFromGroup(group.groupId, screenId)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div className="screen-group-add">
          <select
            aria-label={`Add screen to ${group.name}`}
            disabled={availableScreens.length === 0}
            onChange={(event) =>
              setGroupAddScreen((selections) => ({
                ...selections,
                [group.groupId]: event.target.value
              }))
            }
            value={groupAddScreen[group.groupId] ?? ""}
          >
            <option value="">Choose approved screen</option>
            {availableScreens.map((screen) => (
              <option key={screen.screenId} value={screen.screenId}>
                {screen.name}
              </option>
            ))}
          </select>
          <button disabled={isBusy || availableScreens.length === 0} onClick={() => void addScreenToGroup(group.groupId)} type="button">
            Add Screen
          </button>
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

      <section className="operator-panel deployment-overview-panel">
        <div className="operator-panel-header">
          <h3>Deployment Overview</h3>
          <span>{screens.length} screens</span>
        </div>

        <div className="deployment-health-summary">
          <span>{approvedScreens.filter((screen) => screen.connectionStatus === "online").length} online</span>
          <span>{approvedScreens.filter((screen) => screen.connectionStatus !== "online").length} offline</span>
          <span>{pendingScreens.length} pending</span>
          <span>{screens.filter((screen) => screen.healthStatus === "warning" || screen.heartbeat?.playbackError).length} need attention</span>
        </div>

        <div className="deployment-toolbar">
          <label>
            Search screens
            <input
              onChange={(event) => setScreenSearch(event.target.value)}
              placeholder="Reception, hostname, IP..."
              value={screenSearch}
            />
          </label>
          <div className="operator-filter-row" role="group" aria-label="Screen filter">
            {[
              ["all", "All"],
              ["online", "Online"],
              ["offline", "Offline"],
              ["pending", "Pending"],
              ["attention", "Attention"]
            ].map(([value, label]) => (
              <button
                className={screenFilter === value ? "operator-chip active" : "operator-chip"}
                key={value}
                onClick={() => setScreenFilter(value as ScreenFilter)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {screens.length === 0 ? (
          <div className="deployment-empty-state">
            <h3>No screens yet</h3>
            <p>Open the Player on a device to register it. New screens will appear here as Pending Approval.</p>
          </div>
        ) : null}

        {screens.length > 0 && filteredScreens.length === 0 ? (
          <p className="operator-empty">No screens match the current search or filter.</p>
        ) : null}

        {filteredScreens.length > 0 ? (
          <div className="deployment-screen-grid">{filteredScreens.map(renderScreenCard)}</div>
        ) : null}
      </section>

      <div className="screen-registry-grid">
        <section className="operator-panel screen-details-panel">
          <div className="operator-panel-header">
            <h3>Selected Screen</h3>
            <span>{selectedScreen?.name ?? "No screen"}</span>
          </div>
          {renderDetails(selectedScreen)}
        </section>
      </div>

      <section className="operator-panel screen-groups-panel">
        <div className="operator-panel-header">
          <h3>Screen Groups</h3>
          <span>{screenGroups.length}</span>
        </div>

        <div className="screen-group-create">
          <label>
            New group
            <input
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Lobby screens"
              value={newGroupName}
            />
          </label>
          <label>
            Description
            <input
              onChange={(event) => setNewGroupDescription(event.target.value)}
              placeholder="Optional"
              value={newGroupDescription}
            />
          </label>
          <button disabled={isBusy} onClick={() => void createGroup()} type="button">
            Create Group
          </button>
        </div>

        {screenGroups.length === 0 ? <p className="operator-empty">No screen groups yet.</p> : null}
        {screenGroups.length > 0 ? (
          <div className="screen-group-grid">{screenGroups.map(renderGroup)}</div>
        ) : null}
      </section>
    </section>
  );
}
