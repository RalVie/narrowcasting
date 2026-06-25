import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { Campaign } from "../campaignTypes";
import type { Program } from "../programTypes";
import type {
  SchedulerCandidate,
  SchedulerDiagnosticsResult
} from "../schedulerDiagnosticsTypes";
import type { ScreenRecord } from "../screenTypes";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "-";
}

function formatNullable(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function getCampaignId(candidate: SchedulerCandidate | null) {
  if (!candidate || candidate.sourceType !== "campaign") {
    return null;
  }

  const assignmentId = candidate.metadata.assignmentId ?? candidate.id;
  const match = /^campaign:([^:]+):/.exec(assignmentId);
  return match?.[1] ?? null;
}

function describeCandidate(candidate: SchedulerCandidate | null) {
  if (!candidate) {
    return "No winning candidate";
  }

  return `Priority ${candidate.priority} / ${candidate.sourceType} / ${candidate.targetType}`;
}

function describeCandidateDecision(candidate: SchedulerCandidate, winner: SchedulerCandidate | null) {
  if (!candidate.enabled) {
    return "Rejected: disabled";
  }

  if (!winner) {
    return "Rejected: no winner selected";
  }

  if (candidate.id === winner.id) {
    return "Selected";
  }

  if (candidate.priority < winner.priority) {
    return "Rejected: lower priority";
  }

  if (candidate.priority === winner.priority) {
    return "Rejected: equal priority, deterministic ordering selected another candidate";
  }

  return "Rejected";
}

export function SchedulerDiagnosticsPage() {
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState("");
  const [manualScreenId, setManualScreenId] = useState("");
  const [result, setResult] = useState<SchedulerDiagnosticsResult | null>(null);
  const [status, setStatus] = useState("Choose a screen and run diagnostics.");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screenId = manualScreenId.trim() || selectedScreenId;
  const programMap = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs]
  );
  const campaignMap = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns]
  );
  const winningCampaignId = getCampaignId(result?.winningCandidate ?? null);
  const winningCampaign = winningCampaignId ? campaignMap.get(winningCampaignId) ?? null : null;
  const winningProgram = result?.resolvedProgram ?? (
    result?.winningCandidate ? programMap.get(result.winningCandidate.programId) ?? null : null
  );
  const warnings = [
    result && !result.winningCandidate ? "No candidate matched this screen." : null,
    result?.winningCandidate && !result.resolvedProgram ? "Winning candidate references a missing program." : null,
    result?.winningCandidate ? `Winner selected at priority ${result.winningCandidate.priority}.` : null,
    result?.resolvedSchedule.assignmentStatus === "unassigned" ? "Resolved schedule is unassigned." : null
  ].filter((message): message is string => message !== null);

  async function loadReferenceData() {
    try {
      const [screenResponse, programResponse, campaignResponse] = await Promise.all([
        fetch(apiUrl("/api/screens")),
        fetch(apiUrl("/api/programs")),
        fetch(apiUrl("/api/campaigns"))
      ]);

      if (!screenResponse.ok) {
        throw new Error(`screens HTTP ${screenResponse.status}`);
      }

      if (!programResponse.ok) {
        throw new Error(`programs HTTP ${programResponse.status}`);
      }

      if (!campaignResponse.ok) {
        throw new Error(`campaigns HTTP ${campaignResponse.status}`);
      }

      const screenBody = (await screenResponse.json()) as ScreenRecord[];
      const programBody = (await programResponse.json()) as Program[];
      const campaignBody = (await campaignResponse.json()) as Campaign[];

      setScreens(screenBody);
      setPrograms(programBody);
      setCampaigns(campaignBody);
      setSelectedScreenId((currentId) => currentId || screenBody[0]?.screenId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load diagnostics references.");
    }
  }

  async function runDiagnostics() {
    if (!screenId) {
      setError("Select or enter a screenId first.");
      setStatus("Diagnostics not run.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus("Resolving schedule...");

    try {
      const response = await fetch(apiUrl(`/api/scheduler/resolve?screenId=${encodeURIComponent(screenId)}`));

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      const body = (await response.json()) as SchedulerDiagnosticsResult;
      setResult(body);
      setStatus("Diagnostics loaded.");
    } catch (resolveError) {
      setResult(null);
      setError(resolveError instanceof Error ? resolveError.message : "Diagnostics request failed.");
      setStatus("Diagnostics failed.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReferenceData();
  }, []);

  function renderCandidate(candidate: SchedulerCandidate) {
    const program = programMap.get(candidate.programId);
    const campaignId = getCampaignId(candidate);
    const campaign = campaignId ? campaignMap.get(campaignId) : null;
    const decision = describeCandidateDecision(candidate, result?.winningCandidate ?? null);
    const isSelected = candidate.id === result?.winningCandidate?.id;

    return (
      <article className={`diagnostics-candidate-card${isSelected ? " selected" : ""}`} key={candidate.id}>
        <strong>{candidate.id}</strong>
        <span className={isSelected ? "diagnostics-selected-mark" : "diagnostics-rejected-mark"}>
          {decision}
        </span>
        <dl className="diagnostics-meta">
          <dt>Priority</dt>
          <dd>{candidate.priority}</dd>
          <dt>Source</dt>
          <dd>{candidate.sourceType}</dd>
          <dt>Target</dt>
          <dd>
            {candidate.targetType} / {candidate.targetId}
          </dd>
          <dt>Enabled</dt>
          <dd>{candidate.enabled ? "Yes" : "No"}</dd>
          <dt>Program</dt>
          <dd>{program?.name ?? candidate.programId}</dd>
          <dt>Assignment</dt>
          <dd>{candidate.metadata.assignmentId ?? "-"}</dd>
          <dt>Campaign</dt>
          <dd>{campaign?.name ?? campaignId ?? "-"}</dd>
        </dl>
      </article>
    );
  }

  return (
    <section className="page-section" id="scheduler-diagnostics">
      <div className="section-heading">
        <div>
          <h2>Scheduler Diagnostics</h2>
          <p>Inspect how the Scheduler Resolver selected the current resolved schedule.</p>
        </div>
        <button disabled={isLoading} onClick={() => void runDiagnostics()} type="button">
          Refresh
        </button>
      </div>

      <section className="operator-panel diagnostics-control-panel">
        <div className="operator-panel-header">
          <h3>Screen Lookup</h3>
          <span>{screens.length} screens</span>
        </div>
        <div className="diagnostics-control-grid">
          <label>
            Existing screen
            <select
              onChange={(event) => setSelectedScreenId(event.target.value)}
              value={selectedScreenId}
            >
              <option value="">Choose screen</option>
              {screens.map((screen) => (
                <option key={screen.screenId} value={screen.screenId}>
                  {screen.name} / {screen.screenId}
                </option>
              ))}
            </select>
          </label>
          <label>
            Manual screenId
            <input
              onChange={(event) => setManualScreenId(event.target.value)}
              placeholder="Paste screenId"
              value={manualScreenId}
            />
          </label>
          <button disabled={isLoading || !screenId} onClick={() => void runDiagnostics()} type="button">
            Run Diagnostics
          </button>
        </div>
      </section>

      <p className="status-text">{isLoading ? "Loading diagnostics..." : status}</p>
      {error ? <p className="diagnostics-error">Error: {error}</p> : null}
      {!result && !isLoading && !error ? (
        <p className="operator-empty">No diagnostics loaded yet.</p>
      ) : null}

      {result ? (
        <div className="diagnostics-grid">
          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Resolver Status</h3>
              <span>{result.reason}</span>
            </div>
            <dl className="diagnostics-meta">
              <dt>Screen ID</dt>
              <dd>{result.screenContext.screenId}</dd>
              <dt>Screen Name</dt>
              <dd>{result.screenContext.screen?.name ?? "Unknown screen"}</dd>
              <dt>Groups</dt>
              <dd>{result.screenContext.groups.map((group) => group.name).join(", ") || "-"}</dd>
              <dt>Resolved At</dt>
              <dd>{formatDateTime(result.resolvedSchedule.updatedAt)}</dd>
            </dl>
          </section>

          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Winning Candidate</h3>
              <span>{describeCandidate(result.winningCandidate)}</span>
            </div>
            <dl className="diagnostics-meta">
              <dt>Candidate ID</dt>
              <dd>{result.winningCandidate?.id ?? "-"}</dd>
              <dt>Source</dt>
              <dd>{result.winningCandidate?.sourceType ?? "-"}</dd>
              <dt>Target</dt>
              <dd>
                {result.winningCandidate
                  ? `${result.winningCandidate.targetType} / ${result.winningCandidate.targetId}`
                  : "-"}
              </dd>
              <dt>Assignment</dt>
              <dd>{result.winningCandidate?.metadata.assignmentId ?? "-"}</dd>
              <dt>Priority</dt>
              <dd>{result.winningCandidate?.priority ?? "-"}</dd>
              <dt>Campaign</dt>
              <dd>{winningCampaign?.name ?? winningCampaignId ?? "-"}</dd>
            </dl>
          </section>

          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Program / Playlist</h3>
              <span>{winningProgram?.name ?? "No program"}</span>
            </div>
            <dl className="diagnostics-meta">
              <dt>Program ID</dt>
              <dd>{winningProgram?.id ?? "-"}</dd>
              <dt>Playlist IDs</dt>
              <dd>{winningProgram?.playlistIds.join(", ") || "-"}</dd>
              <dt>Program Options</dt>
              <dd>{winningProgram?.options ? JSON.stringify(winningProgram.options) : "-"}</dd>
            </dl>
          </section>

          <section className="operator-panel">
            <div className="operator-panel-header">
              <h3>Generated Schedule</h3>
              <span>{result.resolvedSchedule.itemCount} items</span>
            </div>
            <dl className="diagnostics-meta">
              <dt>Version</dt>
              <dd>{result.resolvedSchedule.version}</dd>
              <dt>Updated</dt>
              <dd>{formatDateTime(result.resolvedSchedule.updatedAt)}</dd>
              <dt>Status</dt>
              <dd>{formatNullable(result.resolvedSchedule.assignmentStatus)}</dd>
              <dt>Assigned Program</dt>
              <dd>{formatNullable(result.resolvedSchedule.assignedProgramName ?? result.resolvedSchedule.assignedProgramId)}</dd>
            </dl>
          </section>

          <section className="operator-panel diagnostics-wide-panel">
            <div className="operator-panel-header">
              <h3>Ordered Candidates</h3>
              <span>{result.candidates.length}</span>
            </div>
            {result.candidates.length === 0 ? <p className="operator-empty">No candidates matched this screen.</p> : null}
            {result.candidates.length > 0 ? (
              <div className="diagnostics-candidate-grid">{result.candidates.map(renderCandidate)}</div>
            ) : null}
          </section>

          <section className="operator-panel diagnostics-wide-panel">
            <div className="operator-panel-header">
              <h3>Diagnostics / Warnings</h3>
              <span>{warnings.length}</span>
            </div>
            {warnings.length === 0 ? <p className="operator-empty">No warnings.</p> : null}
            {warnings.map((warning) => (
              <p className="diagnostics-warning" key={warning}>
                {warning}
              </p>
            ))}
          </section>

          <details className="operator-panel diagnostics-wide-panel diagnostics-raw-panel">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
