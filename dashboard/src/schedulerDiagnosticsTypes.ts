import type { Assignment } from "./assignmentTypes";
import type { Program } from "./programTypes";
import type { ScreenGroup, ScreenRecord } from "./screenTypes";

export type SchedulerCandidateSourceType = "campaign" | "assignment" | "override" | "fallback";
export type SchedulerCandidateTargetType = "screen" | "group";

export interface SchedulerCandidate {
  id: string;
  sourceType: SchedulerCandidateSourceType;
  targetType: SchedulerCandidateTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  metadata: {
    assignmentId?: string;
    assignmentSource?: Assignment["source"];
    assignment?: Assignment;
    matchedGroupName?: string;
  };
}

export interface SchedulerResolvedScheduleSummary {
  version: number;
  updatedAt: string;
  assignmentStatus?: "assigned" | "unassigned";
  assignedProgramId?: string | null;
  assignedProgramName?: string | null;
  itemCount: number;
}

export interface SchedulerDiagnosticsResult {
  screenContext: {
    screenId: string;
    screen: ScreenRecord | null;
    groups: ScreenGroup[];
  };
  candidates: SchedulerCandidate[];
  winningCandidate: SchedulerCandidate | null;
  reason: string;
  resolvedProgram: Program | null;
  resolvedSchedule: SchedulerResolvedScheduleSummary;
}
