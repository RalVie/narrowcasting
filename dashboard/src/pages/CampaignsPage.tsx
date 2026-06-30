import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { AssignmentTargetType } from "../assignmentTypes";
import type { Campaign } from "../campaignTypes";
import type { Program } from "../programTypes";
import type { PublishValidationMessage, PublishValidationReport } from "../publishValidationTypes";
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
  const [publishReport, setPublishReport] = useState<PublishValidationReport | null>(null);
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

  function campaignPayload(draft: CampaignDraft, fallbackName: string) {
    return {
      ...draft,
      name: draft.name.trim() || fallbackName,
      description: draft.description.trim() || null
    };
  }

  function isPublishValidationReport(value: unknown): value is PublishValidationReport {
    return Boolean(
      value &&
        typeof value === "object" &&
        "summary" in value &&
        "blockingErrors" in value &&
        "warnings" in value &&
        "information" in value
    );
  }

  async function readCampaignMutationError(response: Response) {
    const body: unknown = await response.json().catch(() => null);

    return campaignMutationErrorMessage(body, response.status);
  }

  function campaignMutationErrorMessage(body: unknown, statusCode: number) {
    if (
      body &&
      typeof body === "object" &&
      "report" in body &&
      isPublishValidationReport((body as { report?: unknown }).report)
    ) {
      setPublishReport((body as { report: PublishValidationReport }).report);
    }

    if (body && typeof body === "object") {
      if ("message" in body && typeof (body as { message?: unknown }).message === "string") {
        return (body as { message: string }).message;
      }

      if ("error" in body && typeof (body as { error?: unknown }).error === "string") {
        return (body as { error: string }).error;
      }
    }

    return `HTTP ${statusCode}`;
  }

  function isRevisionExpiredResponse(body: unknown) {
    if (!body || typeof body !== "object" || !("code" in body)) {
      return false;
    }

    const code = (body as { code?: unknown }).code;

    return code === "PUBLISH_REVISION_OUTDATED" || code === "PUBLISH_REVISION_REQUIRED";
  }

  async function readCampaignMutationBody(response: Response) {
    const body: unknown = await response.json().catch(() => null);

    if (
      body &&
      typeof body === "object" &&
      "report" in body &&
      isPublishValidationReport((body as { report?: unknown }).report)
    ) {
      setPublishReport((body as { report: PublishValidationReport }).report);
    }

    return body;
  }

  async function runPublishPreflight(endpoint: string, payload: unknown) {
    const response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await readCampaignMutationError(response));
    }

    const report = (await response.json()) as PublishValidationReport;
    setPublishReport(report);

    if (report.summary.blockingErrors > 0) {
      setStatus("Publishing blocked by validation.");
      return null;
    }

    return report;
  }

  function buildWarningConfirmationText(report: PublishValidationReport) {
    const warningLines = report.warnings.slice(0, 6).map((warning) => `- ${warning.message}`);
    const impactLines =
      report.impact?.screens.slice(0, 6).map((screen) => {
        const result = impactResultLabel(screen.result);
        return `- ${screen.screenName}: ${result}. ${screen.reason}`;
      }) ?? [];
    const fixLines = report.suggestedFixes.slice(0, 5).map((fix) => `- ${fix}`);
    const remainingWarnings =
      report.warnings.length > warningLines.length
        ? `...and ${report.warnings.length - warningLines.length} more warning(s).`
        : "";
    const remainingImpact =
      report.impact && report.impact.screens.length > impactLines.length
        ? `...and ${report.impact.screens.length - impactLines.length} more affected screen(s).`
        : "";

    return [
      "This campaign can be published, but there are warnings.",
      "",
      "Summary:",
      `${report.summary.blockingErrors} blocking error(s)`,
      `${report.summary.warnings} warning(s)`,
      `${report.summary.information} informational message(s)`,
      "",
      "Warnings:",
      warningLines.length > 0 ? warningLines.join("\n") : "- None",
      remainingWarnings,
      "",
      "Runtime Impact Preview:",
      impactLines.length > 0 ? impactLines.join("\n") : "- No affected screens",
      remainingImpact,
      "",
      "Suggested Fixes:",
      fixLines.length > 0 ? fixLines.join("\n") : "- None",
      "",
      "Do you want to publish anyway?"
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  function confirmPublishWarnings(report: PublishValidationReport) {
    if (report.summary.warnings === 0) {
      return true;
    }

    return window.confirm(buildWarningConfirmationText(report));
  }

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
    setIsBusy(true);
    setStatus("Running publish validation...");

    try {
      const payload = campaignPayload(newDraft, "New Campaign");
      let report = await runPublishPreflight("/api/campaigns/validate", payload);

      if (!report) {
        return;
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const confirmWarnings = report.summary.warnings > 0;

        if (confirmWarnings && !confirmPublishWarnings(report)) {
          setStatus("Publish cancelled. Warnings were not confirmed.");
          return;
        }

        setStatus(confirmWarnings ? "Warnings confirmed. Publishing campaign..." : "Validation passed. Publishing campaign...");

        const response = await fetch(apiUrl("/api/campaigns"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ...payload, confirmWarnings, publishRevision: report.revision })
        });

        if (response.ok) {
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
          return;
        }

        const body = await readCampaignMutationBody(response);

        if (isRevisionExpiredResponse(body) && attempt === 0) {
          setStatus("Publish revision expired. Running preflight again...");
          report = await runPublishPreflight("/api/campaigns/validate", payload);

          if (!report) {
            return;
          }

          continue;
        }

        throw new Error(campaignMutationErrorMessage(body, response.status));
      }

      throw new Error("Publish revision could not be confirmed.");
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
    setStatus("Running publish validation...");

    try {
      const payload = campaignPayload(draft, "Untitled Campaign");
      let report = await runPublishPreflight(`/api/campaigns/${encodeURIComponent(campaign.id)}/validate`, payload);

      if (!report) {
        return;
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const confirmWarnings = report.summary.warnings > 0;

        if (confirmWarnings && !confirmPublishWarnings(report)) {
          setStatus("Update cancelled. Warnings were not confirmed.");
          return;
        }

        setStatus(confirmWarnings ? "Warnings confirmed. Updating campaign..." : "Validation passed. Updating campaign...");

        const response = await fetch(apiUrl(`/api/campaigns/${encodeURIComponent(campaign.id)}/update`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ...payload, confirmWarnings, publishRevision: report.revision })
        });

        if (response.ok) {
          setStatus("Campaign updated.");
          await loadCampaigns();
          return;
        }

        const body = await readCampaignMutationBody(response);

        if (isRevisionExpiredResponse(body) && attempt === 0) {
          setStatus("Publish revision expired. Running preflight again...");
          report = await runPublishPreflight(`/api/campaigns/${encodeURIComponent(campaign.id)}/validate`, payload);

          if (!report) {
            return;
          }

          continue;
        }

        throw new Error(campaignMutationErrorMessage(body, response.status));
      }

      throw new Error("Publish revision could not be confirmed.");
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

  function reportStatusLabel(report: PublishValidationReport) {
    if (report.status === "blocked") {
      return "Blocking Errors";
    }

    if (report.status === "warnings") {
      return "Warnings";
    }

    return "Ready";
  }

  function renderReportMessages(title: string, messages: PublishValidationMessage[]) {
    if (messages.length === 0) {
      return null;
    }

    return (
      <div className="publish-report-group">
        <strong>{title}</strong>
        {messages.map((message) => (
          <p key={message.id}>
            <span>{message.category}</span>
            {message.message}
            {message.affectedObject ? (
              <small>
                {message.affectedObject.type}: {message.affectedObject.name ?? message.affectedObject.id}
              </small>
            ) : null}
            {message.suggestedFix ? <small>{message.suggestedFix}</small> : null}
          </p>
        ))}
      </div>
    );
  }

  function impactResultLabel(result: string) {
    if (result === "wins") {
      return "Wins";
    }

    if (result === "loses") {
      return "Loses";
    }

    if (result === "no_assignment") {
      return "No assignment";
    }

    return "Unknown";
  }

  function renderPublishImpact(report: PublishValidationReport) {
    if (!report.impact || report.impact.screens.length === 0) {
      return null;
    }

    return (
      <div className="publish-impact">
        <strong>Runtime Impact Preview</strong>
        <div className="publish-impact-summary">
          <span>{report.impact.summary.affectedScreens} screens</span>
          <span>{report.impact.summary.wins} wins</span>
          <span>{report.impact.summary.loses} loses</span>
          <span>{report.impact.summary.noAssignment} no assignment</span>
          <span>{report.impact.summary.unknown} unknown</span>
        </div>
        <div className="publish-impact-list">
          {report.impact.screens.map((screen) => (
            <article className={`publish-impact-row ${screen.result}`} key={screen.screenId}>
              <div>
                <strong>{screen.screenName}</strong>
                <small>
                  Target: {screen.targetSource.name ?? screen.targetSource.id}
                  {screen.winningProgramName ? ` - Program: ${screen.winningProgramName}` : ""}
                </small>
              </div>
              <span>{impactResultLabel(screen.result)}</span>
              <p>{screen.reason}</p>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderPublishReport() {
    if (!publishReport) {
      return null;
    }

    return (
      <section className={`operator-panel publish-report ${publishReport.status}`}>
        <div className="operator-panel-header">
          <h3>Publish Validation</h3>
          <span>{reportStatusLabel(publishReport)}</span>
        </div>
        <div className="publish-report-summary">
          <span>{publishReport.summary.blockingErrors} blocking</span>
          <span>{publishReport.summary.warnings} warnings</span>
          <span>{publishReport.summary.information} info</span>
        </div>
        <p className="publish-revision">Revision {publishReport.revision.slice(0, 12)}</p>
        {renderPublishImpact(publishReport)}
        {renderReportMessages("Blocking Errors", publishReport.blockingErrors)}
        {renderReportMessages("Warnings", publishReport.warnings)}
        {renderReportMessages("Information", publishReport.information)}
      </section>
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
      {renderPublishReport()}

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
