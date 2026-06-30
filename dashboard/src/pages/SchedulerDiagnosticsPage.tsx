import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { Campaign } from "../campaignTypes";
import type { Program } from "../programTypes";
import type {
  RejectedSchedulerCandidate,
  SchedulerCandidate,
  SchedulerDiagnosticsResult,
  SchedulerResolutionTraceEntry
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

  if (candidate.metadata.assignmentSourceId) {
    return candidate.metadata.assignmentSourceId;
  }

  if (candidate.metadata.assignment?.sourceId) {
    return candidate.metadata.assignment.sourceId;
  }

  const assignmentId = candidate.metadata.assignmentId ?? candidate.id;
  const match = /^campaign:([^:]+):/.exec(assignmentId);
  return match?.[1] ?? null;
}

function getAssignmentOrigin(candidate: SchedulerCandidate) {
  if (candidate.metadata.assignmentSourceType === "campaign" || candidate.sourceType === "campaign") {
    return `Campaign: ${
      candidate.metadata.assignmentSourceName ??
      candidate.metadata.assignment?.sourceName ??
      candidate.metadata.assignmentSourceId ??
      candidate.metadata.assignment?.sourceId ??
      "Unknown campaign"
    }`;
  }

  return "Manual";
}

function describeCandidate(candidate: SchedulerCandidate | null) {
  if (!candidate) {
    return "No winning candidate";
  }

  return `Priority ${candidate.priority} / ${candidate.sourceType} / ${candidate.targetType}`;
}

function describeCandidateDecision(candidate: SchedulerCandidate, winner: SchedulerCandidate | null) {
  if (candidate.metadata.selectionReason) {
    return candidate.metadata.selectionReason;
  }

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
    return "Rejected: deterministic resolver order selected another candidate";
  }

  return "Rejected";
}

function formatTieBreakRank(candidate: SchedulerCandidate) {
  return candidate.metadata.tieBreakRank?.join(" / ") ?? "-";
}

function formatAssignmentSchedule(candidate: SchedulerCandidate) {
  const schedule = candidate.metadata.assignment?.schedule;

  if (!schedule) {
    return "Always active";
  }

  return [
    `enabled=${schedule.enabled}`,
    schedule.startDate ? `from ${schedule.startDate}` : null,
    schedule.endDate ? `until ${schedule.endDate}` : null,
    schedule.daysOfWeek && schedule.daysOfWeek.length > 0 ? `days ${schedule.daysOfWeek.join(",")}` : null,
    schedule.startTime ? `start ${schedule.startTime}` : null,
    schedule.endTime ? `end ${schedule.endTime}` : null
  ]
    .filter((part): part is string => part !== null)
    .join(" / ");
}

function getTraceMark(status: SchedulerResolutionTraceEntry["evaluationStatus"]) {
  if (status === "Selected") {
    return "Selected";
  }

  if (status === "Ignored") {
    return "Ignored";
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
  const trace = result?.trace;
  const warnings = [
    result && !result.winningCandidate ? "No candidate matched this screen." : null,
    result?.winningCandidate && !result.resolvedProgram ? "Winning candidate references a missing program." : null,
    result?.winningCandidate ? `Winner selected at priority ${result.winningCandidate.priority}.` : null,
    result?.rejectedCandidates && result.rejectedCandidates.length > 0
      ? `${result.rejectedCandidates.length} assignment candidates are inactive.`
      : null,
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
          <dt>Assignment Origin</dt>
          <dd>{getAssignmentOrigin(candidate)}</dd>
          <dt>Target</dt>
          <dd>
            {candidate.targetType} / {candidate.targetId}
          </dd>
          <dt>Enabled</dt>
          <dd>{candidate.enabled ? "Yes" : "No"}</dd>
          <dt>Schedule Status</dt>
          <dd>{candidate.metadata.scheduleStatus ?? "active"}</dd>
          <dt>Schedule Reason</dt>
          <dd>{candidate.metadata.scheduleReason ?? "Active"}</dd>
          <dt>Tie-break Rank</dt>
          <dd>{formatTieBreakRank(candidate)}</dd>
          <dt>Assignment Schedule</dt>
          <dd>{formatAssignmentSchedule(candidate)}</dd>
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

  function renderRejectedCandidate(candidate: RejectedSchedulerCandidate) {
    const program = programMap.get(candidate.programId);
    const campaignId = getCampaignId(candidate);
    const campaign = campaignId ? campaignMap.get(campaignId) : null;

    return (
      <article className="diagnostics-candidate-card rejected" key={candidate.id}>
        <strong>{candidate.id}</strong>
        <span className="diagnostics-rejected-mark">Rejected: {candidate.rejectedReason}</span>
        <dl className="diagnostics-meta">
          <dt>Priority</dt>
          <dd>{candidate.priority}</dd>
          <dt>Source</dt>
          <dd>{candidate.sourceType}</dd>
          <dt>Assignment Origin</dt>
          <dd>{getAssignmentOrigin(candidate)}</dd>
          <dt>Target</dt>
          <dd>
            {candidate.targetType} / {candidate.targetId}
          </dd>
          <dt>Schedule Status</dt>
          <dd>{candidate.metadata.scheduleStatus ?? "inactive"}</dd>
          <dt>Schedule Reason</dt>
          <dd>{candidate.metadata.scheduleReason ?? candidate.rejectedReason}</dd>
          <dt>Tie-break Rank</dt>
          <dd>{formatTieBreakRank(candidate)}</dd>
          <dt>Assignment Schedule</dt>
          <dd>{formatAssignmentSchedule(candidate)}</dd>
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

  function renderTraceEntry(entry: SchedulerResolutionTraceEntry, index: number) {
    const program = programMap.get(entry.programId);
    const campaignId = getCampaignId(entry.candidate);
    const campaign = campaignId ? campaignMap.get(campaignId) : null;
    const statusLabel = getTraceMark(entry.evaluationStatus);
    const isSelected = entry.evaluationStatus === "Selected";

    return (
      <details className={`diagnostics-trace-entry${isSelected ? " selected" : ""}`} key={`${entry.candidateId}-${index}`}>
        <summary>
          <span>{statusLabel}</span>
          <strong>{entry.candidateId}</strong>
          <small>Priority {entry.priority}</small>
        </summary>
        <dl className="diagnostics-meta">
          <dt>Selection Result</dt>
          <dd>{entry.selectionResult}</dd>
          <dt>Rejection Reason</dt>
          <dd>{entry.rejectionReason ?? "-"}</dd>
          <dt>Tie-break Rank</dt>
          <dd>{formatTieBreakRank(entry.candidate)}</dd>
          <dt>Source</dt>
          <dd>{entry.sourceType}</dd>
          <dt>Assignment Origin</dt>
          <dd>{getAssignmentOrigin(entry.candidate)}</dd>
          <dt>Target</dt>
          <dd>
            {entry.targetType} / {entry.targetId}
          </dd>
          <dt>Schedule Status</dt>
          <dd>{entry.scheduleStatus}</dd>
          <dt>Schedule Reason</dt>
          <dd>{entry.candidate.metadata.scheduleReason ?? "-"}</dd>
          <dt>Assignment</dt>
          <dd>{entry.candidate.metadata.assignmentId ?? "-"}</dd>
          <dt>Campaign</dt>
          <dd>{campaign?.name ?? campaignId ?? "-"}</dd>
          <dt>Program</dt>
          <dd>{program?.name ?? entry.programId}</dd>
          <dt>Playlist IDs</dt>
          <dd>{program?.playlistIds.join(", ") || "-"}</dd>
          <dt>Assignment Schedule</dt>
          <dd>{formatAssignmentSchedule(entry.candidate)}</dd>
        </dl>
      </details>
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
              <dt>Resolved At</dt>
              <dd>{trace?.resolvedAt ? formatDateTime(trace.resolvedAt) : formatDateTime(result.resolvedSchedule.updatedAt)}</dd>
              <dt>Resolver Version</dt>
              <dd>{trace?.resolverVersion ?? "-"}</dd>
              <dt>Screen ID</dt>
              <dd>{result.screenContext.screenId}</dd>
              <dt>Screen Name</dt>
              <dd>{result.screenContext.screen?.name ?? "Unknown screen"}</dd>
              <dt>Groups</dt>
              <dd>{result.screenContext.groups.map((group) => group.name).join(", ") || "-"}</dd>
              <dt>Candidates Found</dt>
              <dd>{trace?.totalCandidatesDiscovered ?? result.candidates.length + (result.rejectedCandidates?.length ?? 0)}</dd>
              <dt>Candidates Evaluated</dt>
              <dd>{trace?.totalCandidatesEvaluated ?? result.candidates.length}</dd>
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
              <dt>Assignment Origin</dt>
              <dd>{result.winningCandidate ? getAssignmentOrigin(result.winningCandidate) : "-"}</dd>
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
              <dt>Selection Reason</dt>
              <dd>{result.winningCandidate?.metadata.selectionReason ?? result.reason}</dd>
              <dt>Tie-break Rank</dt>
              <dd>{result.winningCandidate ? formatTieBreakRank(result.winningCandidate) : "-"}</dd>
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
              <h3>Evaluation Timeline</h3>
              <span>{trace?.orderedEvaluationList.length ?? 0}</span>
            </div>
            {!trace || trace.orderedEvaluationList.length === 0 ? (
              <p className="operator-empty">No trace entries available.</p>
            ) : null}
            {trace && trace.orderedEvaluationList.length > 0 ? (
              <div className="diagnostics-trace-list">
                {trace.orderedEvaluationList.map(renderTraceEntry)}
              </div>
            ) : null}
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
              <h3>Rejected / Inactive Assignments</h3>
              <span>{result.rejectedCandidates?.length ?? 0}</span>
            </div>
            {!result.rejectedCandidates || result.rejectedCandidates.length === 0 ? (
              <p className="operator-empty">No inactive assignment candidates.</p>
            ) : null}
            {result.rejectedCandidates && result.rejectedCandidates.length > 0 ? (
              <div className="diagnostics-candidate-grid">
                {result.rejectedCandidates.map(renderRejectedCandidate)}
              </div>
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
