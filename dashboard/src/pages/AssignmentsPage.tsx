import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { Assignment, AssignmentSchedule, AssignmentTargetType } from "../assignmentTypes";
import type { Program } from "../programTypes";
import type { ScreenGroup, ScreenRecord } from "../screenTypes";

const refreshIntervalMs = 10_000;
const daysOfWeek = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

type AssignmentDraft = Pick<Assignment, "targetType" | "targetId" | "programId" | "enabled"> & {
  schedule?: AssignmentSchedule;
};

function formatTargetType(value: AssignmentTargetType) {
  return value === "SCREEN" ? "Screen" : "Screen Group";
}

function formatDateTime(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "-";
}

function formatAssignmentOrigin(assignment: Assignment) {
  if (assignment.sourceType === "campaign") {
    return `Campaign: ${assignment.sourceName ?? assignment.sourceId ?? "Unknown campaign"}`;
  }

  return "Manual";
}

export function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [screenGroups, setScreenGroups] = useState<ScreenGroup[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [status, setStatus] = useState("Loading assignments...");
  const [isBusy, setIsBusy] = useState(false);
  const [targetType, setTargetType] = useState<AssignmentTargetType>("SCREEN");
  const [targetId, setTargetId] = useState("");
  const [programId, setProgramId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AssignmentDraft>>({});

  const approvedScreens = useMemo(
    () => screens.filter((screen) => screen.status === "approved"),
    [screens]
  );
  const screenMap = useMemo(
    () => new Map(screens.map((screen) => [screen.screenId, screen])),
    [screens]
  );
  const groupMap = useMemo(
    () => new Map(screenGroups.map((group) => [group.groupId, group])),
    [screenGroups]
  );
  const programMap = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs]
  );

  const availableTargets = targetType === "SCREEN" ? approvedScreens : screenGroups;

  async function loadAssignments() {
    try {
      const [assignmentResponse, screenResponse, groupResponse, programResponse] = await Promise.all([
        fetch(apiUrl("/api/assignments")),
        fetch(apiUrl("/api/screens")),
        fetch(apiUrl("/api/screen-groups")),
        fetch(apiUrl("/api/programs"))
      ]);

      if (!assignmentResponse.ok) {
        throw new Error(`assignments HTTP ${assignmentResponse.status}`);
      }

      if (!screenResponse.ok) {
        throw new Error(`screens HTTP ${screenResponse.status}`);
      }

      if (!groupResponse.ok) {
        throw new Error(`screen groups HTTP ${groupResponse.status}`);
      }

      if (!programResponse.ok) {
        throw new Error(`programs HTTP ${programResponse.status}`);
      }

      const assignmentBody = (await assignmentResponse.json()) as Assignment[];
      const screenBody = (await screenResponse.json()) as ScreenRecord[];
      const groupBody = (await groupResponse.json()) as ScreenGroup[];
      const programBody = (await programResponse.json()) as Program[];

      setAssignments(assignmentBody);
      setScreens(screenBody);
      setScreenGroups(groupBody);
      setPrograms(programBody);
      setDrafts((currentDrafts) => ({
        ...Object.fromEntries(
          assignmentBody.map((assignment) => [
            assignment.id,
            {
              targetType: assignment.targetType,
              targetId: assignment.targetId,
              programId: assignment.programId,
              enabled: assignment.enabled,
              schedule: assignment.schedule
            }
          ])
        ),
        ...currentDrafts
      }));
      setTargetId((currentTargetId) => currentTargetId || (targetType === "SCREEN" ? screenBody.find((screen) => screen.status === "approved")?.screenId : groupBody[0]?.groupId) || "");
      setProgramId((currentProgramId) => currentProgramId || programBody[0]?.id || "");
      setStatus("Assignments refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load assignments: ${error.message}` : "Unable to load assignments.");
    }
  }

  async function saveNewAssignment() {
    if (!targetId || !programId) {
      setStatus("Choose a target and a program before saving.");
      return;
    }

    setIsBusy(true);
    setStatus("Saving assignment...");

    try {
      const response = await fetch(apiUrl("/api/assignments"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetType,
          targetId,
          programId,
          enabled: true
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setStatus("Assignment saved.");
      await loadAssignments();
    } catch (error) {
      setStatus(error instanceof Error ? `Save assignment failed: ${error.message}` : "Save assignment failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function updateExistingAssignment(assignment: Assignment) {
    const draft = drafts[assignment.id];

    if (!draft) {
      return;
    }

    setIsBusy(true);
    setStatus("Updating assignment...");

    try {
      const response = await fetch(apiUrl(`/api/assignments/${encodeURIComponent(assignment.id)}/update`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(draft)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }

      setStatus("Assignment updated.");
      await loadAssignments();
    } catch (error) {
      setStatus(error instanceof Error ? `Update assignment failed: ${error.message}` : "Update assignment failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteExistingAssignment(assignment: Assignment) {
    if (!window.confirm("Delete this assignment? The screen or group will not be deleted.")) {
      return;
    }

    setIsBusy(true);
    setStatus("Deleting assignment...");

    try {
      const response = await fetch(apiUrl(`/api/assignments/${encodeURIComponent(assignment.id)}/delete`), {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setStatus("Assignment deleted.");
      await loadAssignments();
    } catch (error) {
      setStatus(error instanceof Error ? `Delete assignment failed: ${error.message}` : "Delete assignment failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadAssignments();
    const timer = window.setInterval(() => {
      void loadAssignments();
    }, refreshIntervalMs);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setTargetId((currentTargetId) => {
      const validTargets = targetType === "SCREEN"
        ? approvedScreens.map((screen) => screen.screenId)
        : screenGroups.map((group) => group.groupId);

      if (currentTargetId && validTargets.includes(currentTargetId)) {
        return currentTargetId;
      }

      return validTargets[0] ?? "";
    });
  }, [targetType, approvedScreens, screenGroups]);

  function getTargetName(assignment: Pick<Assignment, "targetType" | "targetId">) {
    if (assignment.targetType === "SCREEN") {
      return screenMap.get(assignment.targetId)?.name ?? "Missing screen";
    }

    return groupMap.get(assignment.targetId)?.name ?? "Missing group";
  }

  function renderTargetOptions(type: AssignmentTargetType) {
    if (type === "SCREEN") {
      return approvedScreens.map((screen) => (
        <option key={screen.screenId} value={screen.screenId}>
          {screen.name}
        </option>
      ));
    }

    return screenGroups.map((group) => (
      <option key={group.groupId} value={group.groupId}>
        {group.name}
      </option>
    ));
  }

  function updateSchedule(draft: AssignmentDraft, nextSchedule: AssignmentSchedule | undefined): AssignmentDraft {
    return {
      ...draft,
      schedule: nextSchedule
    };
  }

  function renderScheduleEditor(assignment: Assignment, draft: AssignmentDraft) {
    const schedule = draft.schedule;

    return (
      <details className="assignment-schedule-panel">
        <summary>Schedule</summary>
        <div className="assignment-schedule-grid">
          <label className="assignment-toggle">
            Use time window
            <input
              checked={Boolean(schedule)}
              onChange={(event) =>
                setDrafts((currentDrafts) => ({
                  ...currentDrafts,
                  [assignment.id]: updateSchedule(
                    draft,
                    event.target.checked
                      ? {
                          enabled: true
                        }
                      : undefined
                  )
                }))
              }
              type="checkbox"
            />
          </label>
          {schedule ? (
            <>
              <label className="assignment-toggle">
                Schedule enabled
                <input
                  checked={schedule.enabled}
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [assignment.id]: updateSchedule(draft, {
                        ...schedule,
                        enabled: event.target.checked
                      })
                    }))
                  }
                  type="checkbox"
                />
              </label>
              <label>
                Start date
                <input
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [assignment.id]: updateSchedule(draft, {
                        ...schedule,
                        startDate: event.target.value || undefined
                      })
                    }))
                  }
                  placeholder="2026-12-01"
                  type="date"
                  value={schedule.startDate?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                End date
                <input
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [assignment.id]: updateSchedule(draft, {
                        ...schedule,
                        endDate: event.target.value || undefined
                      })
                    }))
                  }
                  placeholder="2026-12-31"
                  type="date"
                  value={schedule.endDate?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                Start time
                <input
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [assignment.id]: updateSchedule(draft, {
                        ...schedule,
                        startTime: event.target.value || undefined
                      })
                    }))
                  }
                  type="time"
                  value={schedule.startTime ?? ""}
                />
              </label>
              <label>
                End time
                <input
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [assignment.id]: updateSchedule(draft, {
                        ...schedule,
                        endTime: event.target.value || undefined
                      })
                    }))
                  }
                  type="time"
                  value={schedule.endTime ?? ""}
                />
              </label>
              <div className="assignment-days-field">
                <span>Days of week</span>
                <div className="assignment-days-row">
                  {daysOfWeek.map((day) => (
                    <label key={day.value}>
                      <input
                        checked={schedule.daysOfWeek?.includes(day.value) ?? false}
                        onChange={(event) => {
                          const selectedDays = new Set(schedule.daysOfWeek ?? []);

                          if (event.target.checked) {
                            selectedDays.add(day.value);
                          } else {
                            selectedDays.delete(day.value);
                          }

                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [assignment.id]: updateSchedule(draft, {
                              ...schedule,
                              daysOfWeek: Array.from(selectedDays).sort()
                            })
                          }));
                        }}
                        type="checkbox"
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section className="page-section" id="advanced-assignments">
      <div className="section-heading">
        <div>
          <h2>Advanced Assignments</h2>
          <p>Technical runtime assignments generated by campaigns or maintained manually.</p>
        </div>
        <button disabled={isBusy} onClick={() => void loadAssignments()} type="button">
          Refresh
        </button>
      </div>

      <p className="status-text">{status}</p>

      <section className="operator-panel assignment-create-panel">
        <div className="operator-panel-header">
          <h3>New Assignment</h3>
          <span>Target to program</span>
        </div>
        <div className="assignment-form-grid">
          <label>
            Target type
            <select
              onChange={(event) => setTargetType(event.target.value as AssignmentTargetType)}
              value={targetType}
            >
              <option value="SCREEN">Screen</option>
              <option value="SCREEN_GROUP">Screen Group</option>
            </select>
          </label>
          <label>
            Target
            <select
              disabled={availableTargets.length === 0}
              onChange={(event) => setTargetId(event.target.value)}
              value={targetId}
            >
              {renderTargetOptions(targetType)}
            </select>
          </label>
          <label>
            Program
            <select onChange={(event) => setProgramId(event.target.value)} value={programId}>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={isBusy || !targetId || !programId} onClick={() => void saveNewAssignment()} type="button">
            Save Assignment
          </button>
        </div>
      </section>

      <section className="operator-panel assignment-list-panel">
        <div className="operator-panel-header">
          <h3>Current Assignments</h3>
          <span>{assignments.length}</span>
        </div>

        {assignments.length === 0 ? <p className="operator-empty">No assignments yet.</p> : null}
        {assignments.length > 0 ? (
          <div className="assignment-list">
            {assignments.map((assignment) => {
              const draft = drafts[assignment.id] ?? assignment;
              const targetOptions = renderTargetOptions(draft.targetType);

              return (
                <article className="assignment-card" key={assignment.id}>
                  <div className="assignment-card-summary">
                    <strong>{getTargetName(assignment)}</strong>
                    <span>
                      {formatTargetType(assignment.targetType)} to {programMap.get(assignment.programId)?.name ?? "Missing program"}
                    </span>
                    <small>
                      Origin {formatAssignmentOrigin(assignment)} / Updated {formatDateTime(assignment.updatedAt)}
                    </small>
                  </div>
                  <div className="assignment-form-grid">
                    <label>
                      Target type
                      <select
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [assignment.id]: {
                              ...draft,
                              targetType: event.target.value as AssignmentTargetType,
                              targetId: ""
                            }
                          }))
                        }
                        value={draft.targetType}
                      >
                        <option value="SCREEN">Screen</option>
                        <option value="SCREEN_GROUP">Screen Group</option>
                      </select>
                    </label>
                    <label>
                      Target
                      <select
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [assignment.id]: {
                              ...draft,
                              targetId: event.target.value
                            }
                          }))
                        }
                        value={draft.targetId}
                      >
                        <option value="">Choose target</option>
                        {targetOptions}
                      </select>
                    </label>
                    <label>
                      Program
                      <select
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [assignment.id]: {
                              ...draft,
                              programId: event.target.value
                            }
                          }))
                        }
                        value={draft.programId}
                      >
                        {programs.map((program) => (
                          <option key={program.id} value={program.id}>
                            {program.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="assignment-toggle">
                      Enabled
                      <input
                        checked={draft.enabled}
                        onChange={(event) =>
                          setDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [assignment.id]: {
                              ...draft,
                              enabled: event.target.checked
                            }
                          }))
                        }
                        type="checkbox"
                      />
                    </label>
                    <div className="assignment-actions">
                      <button disabled={isBusy} onClick={() => void updateExistingAssignment(assignment)} type="button">
                        Save
                      </button>
                      <button disabled={isBusy} onClick={() => void deleteExistingAssignment(assignment)} type="button">
                        Delete
                      </button>
                    </div>
                  </div>
                  {renderScheduleEditor(assignment, draft)}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </section>
  );
}
