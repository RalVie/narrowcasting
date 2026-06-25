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
    assignment: Assignment;
    matchedGroupName?: string;
    scheduleStatus: "active" | "inactive";
    scheduleReason: string;
  };
}

export interface RejectedSchedulerCandidate extends SchedulerCandidate {
  rejectedReason: string;
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
}

export interface SchedulerResolutionResult extends SchedulerResolution {
  schedule: Schedule;
}

function assignmentToCandidate(
  assignment: Assignment,
  scheduleEvaluation: ScheduleEvaluation,
  matchedGroup?: ScreenGroup
): SchedulerCandidate {
  const targetType = assignment.targetType === "SCREEN" ? "screen" : "group";

  return {
    id: assignment.id,
    sourceType: assignment.source === "campaign" ? "campaign" : "assignment",
    targetType,
    targetId: assignment.targetId,
    programId: assignment.programId,
    enabled: assignment.enabled,
    priority: targetType === "screen" ? 200 : 100,
    metadata: {
      assignmentId: assignment.id,
      assignmentSource: assignment.source,
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
    .map((candidate, index) => ({ candidate, index }))
    .filter((item) => item.candidate.enabled)
    .sort((left, right) => {
      if (right.candidate.priority !== left.candidate.priority) {
        return right.candidate.priority - left.candidate.priority;
      }

      return left.index - right.index;
    });
  const winner = validCandidates[0]?.candidate ?? null;

  if (winner) {
    return {
      candidate: winner,
      reason: `selected highest-priority valid candidate: ${winner.priority}`
    };
  }

  return {
    candidate: null,
    reason: "no enabled candidate matched this screen"
  };
}

async function loadResolution(screenId: string): Promise<SchedulerResolution> {
  const [screen, groups, assignments, programs] = await Promise.all([
    getScreenById(screenId),
    listScreenGroups(),
    listAssignments(),
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
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      if (right.candidate.priority !== left.candidate.priority) {
        return right.candidate.priority - left.candidate.priority;
      }

      return left.index - right.index;
    })
    .map((item) => item.candidate);
  const rejectedCandidates = candidateEvaluations
    .filter((item) => !item.scheduleEvaluation.active)
    .map((item) => ({
      ...item.candidate,
      rejectedReason: item.scheduleEvaluation.reason
    }));
  const winner = chooseWinningCandidate(candidates);

  return {
    screenContext: {
      screenId,
      screen,
      groups: matchingGroups
    },
    candidates,
    rejectedCandidates,
    winningCandidate: winner.candidate,
    reason: winner.reason,
    resolvedProgram: winner.candidate
      ? programs.find((program) => program.id === winner.candidate?.programId) ?? null
      : null
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

export async function explainSchedulerResolution(screenId: string) {
  const resolution = await resolveScheduleForScreen(screenId);

  return {
    screenContext: resolution.screenContext,
    candidates: resolution.candidates,
    rejectedCandidates: resolution.rejectedCandidates,
    winningCandidate: resolution.winningCandidate,
    reason: resolution.reason,
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
