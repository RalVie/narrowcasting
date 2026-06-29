import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { AssignmentTargetType } from "../assignmentTypes";
import type { Campaign } from "../campaignTypes";
import type { Program } from "../programTypes";
import type { ScreenGroup, ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;

interface CampaignDraft {
  name: string;
  description: string;
  enabled: boolean;
  programId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
}

function formatDateTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "-";
}

function targetTypeLabel(value: AssignmentTargetType) {
  return value === "SCREEN" ? "Screens" : "Screen Groups";
}

function toDraft(campaign: Campaign): CampaignDraft {
  return {
    name: campaign.name,
    description: campaign.description ?? "",
    enabled: campaign.enabled,
    programId: campaign.programId,
    targetType: campaign.targetType,
    targetIds: campaign.targetIds
  };
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [screenGroups, setScreenGroups] = useState<ScreenGroup[]>([]);
  const [status, setStatus] = useState("Loading campaigns...");
  const [isBusy, setIsBusy] = useState(false);
  const [newDraft, setNewDraft] = useState<CampaignDraft>({
    name: "",
    description: "",
    enabled: true,
    programId: "",
    targetType: "SCREEN",
    targetIds: []
  });
  const [drafts, setDrafts] = useState<Record<string, CampaignDraft>>({});

  const approvedScreens = useMemo(
    () => screens.filter((screen) => screen.status === "approved"),
    [screens]
  );
  const programMap = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs]
  );
  const screenMap = useMemo(
    () => new Map(screens.map((screen) => [screen.screenId, screen])),
    [screens]
  );
  const groupMap = useMemo(
    () => new Map(screenGroups.map((group) => [group.groupId, group])),
    [screenGroups]
  );

  async function loadCampaigns() {
    try {
      const [campaignResponse, programResponse, screenResponse, groupResponse] = await Promise.all([
        fetch(apiUrl("/api/campaigns")),
        fetch(apiUrl("/api/programs")),
        fetch(apiUrl("/api/screens")),
        fetch(apiUrl("/api/screen-groups"))
      ]);

      if (!campaignResponse.ok) {
        throw new Error(`campaigns HTTP ${campaignResponse.status}`);
      }

      if (!programResponse.ok) {
        throw new Error(`programs HTTP ${programResponse.status}`);
      }

      if (!screenResponse.ok) {
        throw new Error(`screens HTTP ${screenResponse.status}`);
      }

      if (!groupResponse.ok) {
        throw new Error(`screen groups HTTP ${groupResponse.status}`);
      }

      const campaignBody = (await campaignResponse.json()) as Campaign[];
      const programBody = (await programResponse.json()) as Program[];
      const screenBody = (await screenResponse.json()) as ScreenRecord[];
      const groupBody = (await groupResponse.json()) as ScreenGroup[];

      setCampaigns(campaignBody);
      setPrograms(programBody);
      setScreens(screenBody);
      setScreenGroups(groupBody);
      setDrafts((currentDrafts) => ({
        ...Object.fromEntries(campaignBody.map((campaign) => [campaign.id, toDraft(campaign)])),
        ...currentDrafts
      }));
      setNewDraft((currentDraft) => ({
        ...currentDraft,
        programId: currentDraft.programId || programBody[0]?.id || ""
      }));
      setStatus("Campaigns refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load campaigns: ${error.message}` : "Unable to load campaigns.");
    }
  }

  async function createCampaign() {
    if (!newDraft.programId || newDraft.targetIds.length === 0) {
      setStatus("Choose a program and at least one target before publishing.");
      return;
    }

    setIsBusy(true);
    setStatus("Publishing campaign...");

    try {
      const response = await fetch(apiUrl("/api/campaigns"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...newDraft,
          name: newDraft.name.trim() || "New Campaign",
          description: newDraft.description.trim() || null
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setNewDraft({
        name: "",
        description: "",
        enabled: true,
        programId: programs[0]?.id ?? "",
        targetType: "SCREEN",
        targetIds: []
      });
      setStatus("Campaign published.");
      await loadCampaigns();
    } catch (error) {
      setStatus(error instanceof Error ? `Publish failed: ${error.message}` : "Publish failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function updateCampaign(campaign: Campaign) {
    const draft = drafts[campaign.id];

    if (!draft) {
      return;
    }

    setIsBusy(true);
    setStatus("Updating campaign...");

    try {
      const response = await fetch(apiUrl(`/api/campaigns/${encodeURIComponent(campaign.id)}/update`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...draft,
          name: draft.name.trim() || "Untitled Campaign",
          description: draft.description.trim() || null
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setStatus("Campaign updated.");
      await loadCampaigns();
    } catch (error) {
      setStatus(error instanceof Error ? `Update failed: ${error.message}` : "Update failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!window.confirm(`Delete campaign "${campaign.name}"? Generated assignments will be removed.`)) {
      return;
    }

    setIsBusy(true);
    setStatus("Deleting campaign...");

    try {
      const response = await fetch(apiUrl(`/api/campaigns/${encodeURIComponent(campaign.id)}/delete`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus("Campaign deleted.");
      await loadCampaigns();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
    const timer = window.setInterval(() => {
      void loadCampaigns();
    }, refreshIntervalMs);

    return () => window.clearInterval(timer);
  }, []);

  function getTargets(type: AssignmentTargetType) {
    return type === "SCREEN" ? approvedScreens : screenGroups;
  }

  function getTargetName(type: AssignmentTargetType, targetId: string) {
    return type === "SCREEN"
      ? screenMap.get(targetId)?.name ?? "Missing screen"
      : groupMap.get(targetId)?.name ?? "Missing group";
  }

  function toggleTarget(draft: CampaignDraft, targetId: string): CampaignDraft {
    return {
      ...draft,
      targetIds: draft.targetIds.includes(targetId)
        ? draft.targetIds.filter((item) => item !== targetId)
        : [...draft.targetIds, targetId]
    };
  }

  function renderTargetPicker(draft: CampaignDraft, onChange: (draft: CampaignDraft) => void) {
    const targets = getTargets(draft.targetType);

    return (
      <div className="campaign-target-picker">
        {targets.length === 0 ? <p className="operator-empty">No targets available.</p> : null}
        {targets.map((target) => {
          const id = "screenId" in target ? target.screenId : target.groupId;
          const name = target.name;

          return (
            <label key={id}>
              <input
                checked={draft.targetIds.includes(id)}
                onChange={() => onChange(toggleTarget(draft, id))}
                type="checkbox"
              />
              {name}
            </label>
          );
        })}
      </div>
    );
  }

  function renderCampaignForm(draft: CampaignDraft, onChange: (draft: CampaignDraft) => void) {
    return (
      <div className="campaign-form-grid">
        <label>
          Campaign name
          <input
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            placeholder="Lunch menu"
            value={draft.name}
          />
        </label>
        <label>
          Description
          <input
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            placeholder="Optional"
            value={draft.description}
          />
        </label>
        <label>
          Program
          <select onChange={(event) => onChange({ ...draft, programId: event.target.value })} value={draft.programId}>
            <option value="">Choose program</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target type
          <select
            onChange={(event) =>
              onChange({
                ...draft,
                targetType: event.target.value as AssignmentTargetType,
                targetIds: []
              })
            }
            value={draft.targetType}
          >
            <option value="SCREEN">Screens</option>
            <option value="SCREEN_GROUP">Screen Groups</option>
          </select>
        </label>
        <label className="campaign-enabled-toggle">
          Enabled
          <input
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
            type="checkbox"
          />
        </label>
        <div className="campaign-targets-field">
          <span>{targetTypeLabel(draft.targetType)}</span>
          {renderTargetPicker(draft, onChange)}
        </div>
      </div>
    );
  }

  return (
    <section className="page-section" id="campaigns">
      <div className="section-heading">
        <div>
          <h2>Campaigns</h2>
          <p>Publish programs to screens and screen groups.</p>
        </div>
        <button disabled={isBusy} onClick={() => void loadCampaigns()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      <section className="operator-panel campaign-create-panel">
        <div className="operator-panel-header">
          <h3>Create Campaign</h3>
          <span>Business workflow</span>
        </div>
        {renderCampaignForm(newDraft, setNewDraft)}
        <button disabled={isBusy} onClick={() => void createCampaign()} type="button">
          Publish Campaign
        </button>
      </section>

      <section className="operator-panel campaign-list-panel">
        <div className="operator-panel-header">
          <h3>Published Campaigns</h3>
          <span>{campaigns.length}</span>
        </div>

        {campaigns.length === 0 ? <p className="operator-empty">No campaigns yet.</p> : null}
        {campaigns.length > 0 ? (
          <div className="campaign-list">
            {campaigns.map((campaign) => {
              const draft = drafts[campaign.id] ?? toDraft(campaign);

              return (
                <article className="campaign-card" key={campaign.id}>
                  <div className="campaign-summary">
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{programMap.get(campaign.programId)?.name ?? "Missing program"}</span>
                    </div>
                    <div>
                      <span>{campaign.enabled ? "Enabled" : "Disabled"}</span>
                      <small>
                        {campaign.targetIds.map((targetId) => getTargetName(campaign.targetType, targetId)).join(", ") || "No targets"}
                      </small>
                    </div>
                    <div>
                      <small>Created {formatDateTime(campaign.createdAt)}</small>
                      <small>Updated {formatDateTime(campaign.updatedAt)}</small>
                    </div>
                  </div>

                  {renderCampaignForm(draft, (nextDraft) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [campaign.id]: nextDraft
                    }))
                  )}

                  <div className="campaign-actions">
                    <button disabled={isBusy} onClick={() => void updateCampaign(campaign)} type="button">
                      Save Campaign
                    </button>
                    <button disabled={isBusy} onClick={() => void deleteCampaign(campaign)} type="button">
                      Delete Campaign
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </section>
  );
}
