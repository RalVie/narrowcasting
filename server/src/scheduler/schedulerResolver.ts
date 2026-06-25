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
  };
}

export interface ScreenContext {
  screenId: string;
  screen: ScreenRecord | null;
  groups: ScreenGroup[];
}

export interface SchedulerResolution {
  screenContext: ScreenContext;
  candidates: SchedulerCandidate[];
  winningCandidate: SchedulerCandidate | null;
  reason: string;
  resolvedProgram: Program | null;
}

export interface SchedulerResolutionResult extends SchedulerResolution {
  schedule: Schedule;
}

function assignmentToCandidate(
  assignment: Assignment,
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
      matchedGroupName: matchedGroup?.name
    }
  };
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
  const candidates = assignments
    .filter((assignment) => {
      if (assignment.targetType === "SCREEN") {
        return assignment.targetId === screenId;
      }

      return matchingGroupById.has(assignment.targetId);
    })
    .map((assignment) => assignmentToCandidate(assignment, matchingGroupById.get(assignment.targetId)))
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      if (right.candidate.priority !== left.candidate.priority) {
        return right.candidate.priority - left.candidate.priority;
      }

      return left.index - right.index;
    })
    .map((item) => item.candidate);
  const winner = chooseWinningCandidate(candidates);

  return {
    screenContext: {
      screenId,
      screen,
      groups: matchingGroups
    },
    candidates,
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
