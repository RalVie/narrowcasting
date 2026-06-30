import { listAssignments, type Assignment } from "../assignments/assignmentStore.js";
import { getProgramsOrDefault, type Program } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { listScreenGroups, type ScreenGroup } from "../screens/screenGroupStore.js";
import { getScreenById, type ScreenRecord } from "../screens/screenStore.js";
import { getThemeOrDefault } from "../theme/themeStore.js";
import {
  getLatestUpdatedAt,
  getScheduleForProgram,
  hashScheduleVersion
} from "./scheduleBuilder.js";

export type CandidateSourceType = "campaign" | "assignment" | "override" | "fallback";
export type CandidateTargetType = "screen" | "group";

export interface SchedulerCandidate {
  id: string;
  sourceType: CandidateSourceType;
  targetType: CandidateTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  priority: number;
  metadata: {
    assignmentId: string;
    assignmentSource: Assignment["source"];
    assignmentSourceType: Assignment["sourceType"];
    assignmentSourceId?: string;
    assignmentSourceName?: string;
    assignment: Assignment;
    matchedGroupName?: string;
    scheduleStatus: "active" | "inactive";
    scheduleReason: string;
    selectionReason?: string;
    tieBreakRank?: string[];
  };
}

export interface RejectedSchedulerCandidate extends SchedulerCandidate {
  rejectedReason: string;
}

export type CandidateEvaluationStatus = "Selected" | "Rejected" | "Ignored";
export type CandidateRejectionReason =
  | "Lower priority"
  | "Less specific target"
  | "Campaign loses to manual assignment"
  | "Older assignment"
  | "Disabled"
  | "Outside date range"
  | "Outside daily time"
  | "Wrong weekday"
  | "No valid assignment"
  | "Stable id fallback";

export interface SchedulerResolutionTraceEntry {
  candidateId: string;
  sourceType: CandidateSourceType;
  targetType: CandidateTargetType;
  targetId: string;
  programId: string;
  priority: number;
  scheduleStatus: "active" | "inactive";
  evaluationStatus: CandidateEvaluationStatus;
  selectionResult: string;
  rejectionReason?: CandidateRejectionReason;
  candidate: SchedulerCandidate;
}

export interface SchedulerResolutionTrace {
  resolvedAt: string;
  screenId: string;
  resolverVersion: string;
  totalCandidatesDiscovered: number;
  totalCandidatesEvaluated: number;
  winningCandidate: SchedulerCandidate | null;
  orderedEvaluationList: SchedulerResolutionTraceEntry[];
}

export interface ScreenContext {
  screenId: string;
  screen: ScreenRecord | null;
  groups: ScreenGroup[];
}

export interface SchedulerResolution {
  screenContext: ScreenContext;
  candidates: SchedulerCandidate[];
  rejectedCandidates: RejectedSchedulerCandidate[];
  winningCandidate: SchedulerCandidate | null;
  reason: string;
  resolvedProgram: Program | null;
  trace: SchedulerResolutionTrace;
}

export interface SchedulerResolutionResult extends SchedulerResolution {
  schedule: Schedule;
}

interface ResolutionOptions {
  assignments?: Assignment[];
}

function assignmentToCandidate(
  assignment: Assignment,
  scheduleEvaluation: ScheduleEvaluation,
  matchedGroup?: ScreenGroup
): SchedulerCandidate {
  const targetType = assignment.targetType === "SCREEN" ? "screen" : "group";

  return {
    id: assignment.id,
    sourceType: assignment.sourceType === "campaign" ? "campaign" : "assignment",
    targetType,
    targetId: assignment.targetId,
    programId: assignment.programId,
    enabled: assignment.enabled,
    priority: assignment.priority ?? (targetType === "screen" ? 200 : 100),
    metadata: {
      assignmentId: assignment.id,
      assignmentSource: assignment.source,
      assignmentSourceType: assignment.sourceType,
      assignmentSourceId: assignment.sourceId,
      assignmentSourceName: assignment.sourceName,
      assignment,
      matchedGroupName: matchedGroup?.name,
      scheduleStatus: scheduleEvaluation.active ? "active" : "inactive",
      scheduleReason: scheduleEvaluation.reason
    }
  };
}

interface ScheduleEvaluation {
  active: boolean;
  reason: string;
}

function targetSpecificity(candidate: SchedulerCandidate) {
  return candidate.targetType === "screen" ? 2 : 1;
}

function sourceSpecificity(candidate: SchedulerCandidate) {
  return candidate.metadata.assignmentSourceType === "manual" ? 2 : 1;
}

function assignmentTime(candidate: SchedulerCandidate) {
  const time =
    Date.parse(candidate.metadata.assignment.updatedAt) ||
    Date.parse(candidate.metadata.assignment.createdAt);

  return Number.isFinite(time) ? time : 0;
}

function assignmentId(candidate: SchedulerCandidate) {
  return candidate.metadata.assignmentId || candidate.id;
}

function compareCandidates(left: SchedulerCandidate, right: SchedulerCandidate) {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }

  const specificityDiff = targetSpecificity(right) - targetSpecificity(left);

  if (specificityDiff !== 0) {
    return specificityDiff;
  }

  const sourceDiff = sourceSpecificity(right) - sourceSpecificity(left);

  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  const timeDiff = assignmentTime(right) - assignmentTime(left);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return assignmentId(left).localeCompare(assignmentId(right));
}

function getTieBreakRank(candidate: SchedulerCandidate) {
  return [
    `priority=${candidate.priority}`,
    `target=${candidate.targetType}`,
    `source=${candidate.metadata.assignmentSourceType}`,
    `updatedAt=${candidate.metadata.assignment.updatedAt || "-"}`,
    `createdAt=${candidate.metadata.assignment.createdAt || "-"}`,
    `id=${assignmentId(candidate)}`
  ];
}

function describeCandidateSelection(candidate: SchedulerCandidate) {
  return `Selected by deterministic resolver order: ${getTieBreakRank(candidate).join(" / ")}`;
}

function describeCandidateRejection(candidate: SchedulerCandidate, winner: SchedulerCandidate): {
  reason: CandidateRejectionReason;
  message: string;
} {
  if (candidate.priority < winner.priority) {
    return {
      reason: "Lower priority",
      message: `Rejected because winning candidate has higher priority (${winner.priority} > ${candidate.priority}).`
    };
  }

  if (targetSpecificity(candidate) < targetSpecificity(winner)) {
    return {
      reason: "Less specific target",
      message: "Rejected because another candidate had the same priority but a more specific screen target."
    };
  }

  if (sourceSpecificity(candidate) < sourceSpecificity(winner)) {
    return {
      reason: "Campaign loses to manual assignment",
      message:
        "Rejected because another candidate had the same priority and target specificity, but the winning assignment was manual."
    };
  }

  if (assignmentTime(candidate) < assignmentTime(winner)) {
    return {
      reason: "Older assignment",
      message:
        "Rejected because another candidate had the same priority, target specificity, and source type, but was updated more recently."
    };
  }

  return {
    reason: "Stable id fallback",
    message:
      "Rejected because all tie-break fields matched and the winning assignment id sorted first deterministically."
  };
}

function parseMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseScheduleDateBoundary(value: string, boundary: "start" | "end") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (boundary === "end") {
      date.setHours(23, 59, 59, 999);
    }

    return date.getTime();
  }

  return Date.parse(value);
}

function evaluateDailyTimeWindow(now: Date, startTime?: string, endTime?: string): ScheduleEvaluation {
  if (!startTime && !endTime) {
    return { active: true, reason: "Active" };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startTime ? parseMinutes(startTime) : null;
  const endMinutes = endTime ? parseMinutes(endTime) : null;

  if (startMinutes !== null && endMinutes !== null) {
    const active =
      startMinutes <= endMinutes
        ? currentMinutes >= startMinutes && currentMinutes < endMinutes
        : currentMinutes >= startMinutes || currentMinutes < endMinutes;

    return active
      ? { active: true, reason: "Active" }
      : { active: false, reason: "Outside daily time" };
  }

  if (startMinutes !== null && currentMinutes < startMinutes) {
    return { active: false, reason: "Outside daily time" };
  }

  if (endMinutes !== null && currentMinutes >= endMinutes) {
    return { active: false, reason: "Outside daily time" };
  }

  return { active: true, reason: "Active" };
}

function evaluateAssignmentSchedule(assignment: Assignment, now = new Date()): ScheduleEvaluation {
  if (!assignment.enabled) {
    return { active: false, reason: "Disabled" };
  }

  if (!assignment.schedule) {
    return { active: true, reason: "Active" };
  }

  if (!assignment.schedule.enabled) {
    return { active: false, reason: "Disabled" };
  }

  if (assignment.schedule.startDate) {
    const startTime = parseScheduleDateBoundary(assignment.schedule.startDate, "start");

    if (Number.isFinite(startTime) && now.getTime() < startTime) {
      return { active: false, reason: "Outside date range" };
    }
  }

  if (assignment.schedule.endDate) {
    const endTime = parseScheduleDateBoundary(assignment.schedule.endDate, "end");

    if (Number.isFinite(endTime) && now.getTime() > endTime) {
      return { active: false, reason: "Outside date range" };
    }
  }

  if (
    assignment.schedule.daysOfWeek &&
    assignment.schedule.daysOfWeek.length > 0 &&
    !assignment.schedule.daysOfWeek.includes(now.getDay())
  ) {
    return { active: false, reason: "Wrong weekday" };
  }

  return evaluateDailyTimeWindow(now, assignment.schedule.startTime, assignment.schedule.endTime);
}

function chooseWinningCandidate(candidates: SchedulerCandidate[]) {
  const validCandidates = candidates
    .filter((candidate) => candidate.enabled)
    .sort(compareCandidates);
  const winner = validCandidates[0] ?? null;

  if (winner) {
    const reason = describeCandidateSelection(winner);

    return {
      candidate: {
        ...winner,
        metadata: {
          ...winner.metadata,
          selectionReason: reason,
          tieBreakRank: getTieBreakRank(winner)
        }
      },
      reason
    };
  }

  return {
    candidate: null,
    reason: "no enabled candidate matched this screen"
  };
}

function toRejectionReason(reason: string): CandidateRejectionReason {
  if (reason === "Disabled") {
    return "Disabled";
  }

  if (reason === "Outside date range") {
    return "Outside date range";
  }

  if (reason === "Outside daily time") {
    return "Outside daily time";
  }

  if (reason === "Wrong weekday") {
    return "Wrong weekday";
  }

  return "No valid assignment";
}

function buildTrace(input: {
  screenId: string;
  candidates: SchedulerCandidate[];
  rejectedCandidates: RejectedSchedulerCandidate[];
  winningCandidate: SchedulerCandidate | null;
  reason: string;
}): SchedulerResolutionTrace {
  const activeTraceEntries: SchedulerResolutionTraceEntry[] = input.candidates.map((candidate) => {
    if (input.winningCandidate?.id === candidate.id) {
      const selectionResult = input.reason || describeCandidateSelection(candidate);

      return {
        candidateId: candidate.id,
        sourceType: candidate.sourceType,
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        programId: candidate.programId,
        priority: candidate.priority,
        scheduleStatus: candidate.metadata.scheduleStatus,
        evaluationStatus: "Selected",
        selectionResult,
        candidate: {
          ...candidate,
          metadata: {
            ...candidate.metadata,
            selectionReason: selectionResult,
            tieBreakRank: getTieBreakRank(candidate)
          }
        }
      };
    }

    const rejection = input.winningCandidate
      ? describeCandidateRejection(candidate, input.winningCandidate)
      : {
          reason: "No valid assignment" as const,
          message: "Rejected because no winning candidate was selected."
        };

    return {
      candidateId: candidate.id,
      sourceType: candidate.sourceType,
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      programId: candidate.programId,
      priority: candidate.priority,
      scheduleStatus: candidate.metadata.scheduleStatus,
      evaluationStatus: "Rejected",
      selectionResult: rejection.message,
      rejectionReason: rejection.reason,
      candidate: {
        ...candidate,
        metadata: {
          ...candidate.metadata,
          selectionReason: rejection.message,
          tieBreakRank: getTieBreakRank(candidate)
        }
      }
    };
  });
  const rejectedTraceEntries: SchedulerResolutionTraceEntry[] = input.rejectedCandidates.map((candidate) => ({
    candidateId: candidate.id,
    sourceType: candidate.sourceType,
    targetType: candidate.targetType,
    targetId: candidate.targetId,
    programId: candidate.programId,
    priority: candidate.priority,
    scheduleStatus: candidate.metadata.scheduleStatus,
    evaluationStatus: "Rejected",
    selectionResult: `Rejected: ${candidate.rejectedReason}`,
    rejectionReason: toRejectionReason(candidate.rejectedReason),
    candidate
  }));

  return {
    resolvedAt: new Date().toISOString(),
    screenId: input.screenId,
    resolverVersion: "priority-time-window-v1",
    totalCandidatesDiscovered: input.candidates.length + input.rejectedCandidates.length,
    totalCandidatesEvaluated: input.candidates.length,
    winningCandidate: input.winningCandidate,
    orderedEvaluationList: [...activeTraceEntries, ...rejectedTraceEntries].sort((left, right) =>
      compareCandidates(left.candidate, right.candidate)
    )
  };
}

async function loadResolution(
  screenId: string,
  options: ResolutionOptions = {}
): Promise<SchedulerResolution> {
  const [screen, groups, assignments, programs] = await Promise.all([
    getScreenById(screenId),
    listScreenGroups(),
    options.assignments ? Promise.resolve(options.assignments) : listAssignments(),
    getProgramsOrDefault()
  ]);
  const matchingGroups = groups.filter((group) => group.screenIds.includes(screenId));
  const matchingGroupById = new Map(matchingGroups.map((group) => [group.groupId, group]));
  const candidateEvaluations = assignments
    .filter((assignment) => {
      if (assignment.targetType === "SCREEN") {
        return assignment.targetId === screenId;
      }

      return matchingGroupById.has(assignment.targetId);
    })
    .map((assignment) => {
      const scheduleEvaluation = evaluateAssignmentSchedule(assignment);
      const candidate = assignmentToCandidate(
        assignment,
        scheduleEvaluation,
        matchingGroupById.get(assignment.targetId)
      );

      return {
        candidate,
        scheduleEvaluation
      };
    });
  const candidates = candidateEvaluations
    .filter((item) => item.scheduleEvaluation.active)
    .map((item) => item.candidate)
    .sort(compareCandidates);
  const rejectedCandidates = candidateEvaluations
    .filter((item) => !item.scheduleEvaluation.active)
    .map((item) => ({
      ...item.candidate,
      rejectedReason: item.scheduleEvaluation.reason,
      metadata: {
        ...item.candidate.metadata,
        selectionReason: `Rejected: ${item.scheduleEvaluation.reason}`,
        tieBreakRank: getTieBreakRank(item.candidate)
      }
    }));
  const winner = chooseWinningCandidate(candidates);
  const diagnosticCandidates = candidates.map((candidate) => {
    if (winner.candidate?.id === candidate.id) {
      return winner.candidate;
    }

    const rejection = winner.candidate
      ? describeCandidateRejection(candidate, winner.candidate)
      : {
          reason: "No valid assignment" as const,
          message: "Rejected because no winning candidate was selected."
        };

    return {
      ...candidate,
      metadata: {
        ...candidate.metadata,
        selectionReason: rejection.message,
        tieBreakRank: getTieBreakRank(candidate)
      }
    };
  });
  const trace = buildTrace({
    screenId,
    candidates: diagnosticCandidates,
    rejectedCandidates,
    winningCandidate: winner.candidate,
    reason: winner.reason
  });

  return {
    screenContext: {
      screenId,
      screen,
      groups: matchingGroups
    },
    candidates: diagnosticCandidates,
    rejectedCandidates,
    winningCandidate: winner.candidate,
    reason: winner.reason,
    resolvedProgram: winner.candidate
      ? programs.find((program) => program.id === winner.candidate?.programId) ?? null
      : null,
    trace
  };
}

async function buildUnassignedSchedule(resolution: SchedulerResolution): Promise<Schedule> {
  const theme = await getThemeOrDefault();
  const candidate = resolution.winningCandidate;

  if (candidate) {
    return {
      version: hashScheduleVersion({
        screenId: resolution.screenContext.screenId,
        assignmentStatus: "unassigned",
        assignment: candidate.metadata.assignment,
        theme
      }),
      updatedAt: candidate.metadata.assignment.updatedAt,
      assignmentStatus: "unassigned",
      assignedProgramId: candidate.programId,
      assignedProgramName: null,
      theme,
      items: []
    };
  }

  return {
    version: hashScheduleVersion({
      screenId: resolution.screenContext.screenId,
      assignmentStatus: "unassigned",
      theme
    }),
    updatedAt: resolution.screenContext.screen?.lastSeen ?? staticSchedule.updatedAt,
    assignmentStatus: "unassigned",
    assignedProgramId: null,
    assignedProgramName: null,
    theme,
    items: []
  };
}

async function buildSchedule(resolution: SchedulerResolution): Promise<Schedule> {
  if (!resolution.winningCandidate || !resolution.resolvedProgram) {
    return buildUnassignedSchedule(resolution);
  }

  const schedule = await getScheduleForProgram(resolution.resolvedProgram);

  return {
    ...schedule,
    version: hashScheduleVersion({
      screenId: resolution.screenContext.screenId,
      assignment: resolution.winningCandidate.metadata.assignment,
      scheduleVersion: schedule.version
    }),
    updatedAt: getLatestUpdatedAt([
      schedule.updatedAt,
      resolution.winningCandidate.metadata.assignment.updatedAt
    ])
  };
}

export async function resolveScheduleForScreen(screenId: string): Promise<SchedulerResolutionResult> {
  const resolution = await loadResolution(screenId);
  const schedule = await buildSchedule(resolution);

  return {
    ...resolution,
    schedule
  };
}

export async function resolveScheduleForScreenWithAssignments(
  screenId: string,
  assignments: Assignment[]
): Promise<SchedulerResolutionResult> {
  const resolution = await loadResolution(screenId, { assignments });
  const schedule = await buildSchedule(resolution);

  return {
    ...resolution,
    schedule
  };
}

export async function explainSchedulerResolution(screenId: string) {
  const resolution = await resolveScheduleForScreen(screenId);

  return {
    screenContext: resolution.screenContext,
    candidates: resolution.candidates,
    rejectedCandidates: resolution.rejectedCandidates,
    winningCandidate: resolution.winningCandidate,
    reason: resolution.reason,
    trace: resolution.trace,
    resolvedProgram: resolution.resolvedProgram,
    resolvedSchedule: {
      version: resolution.schedule.version,
      updatedAt: resolution.schedule.updatedAt,
      assignmentStatus: resolution.schedule.assignmentStatus,
      assignedProgramId: resolution.schedule.assignedProgramId ?? null,
      assignedProgramName: resolution.schedule.assignedProgramName ?? null,
      itemCount: resolution.schedule.items.length
    }
  };
}
