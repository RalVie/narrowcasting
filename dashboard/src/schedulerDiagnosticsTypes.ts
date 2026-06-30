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
  priority: number;
  metadata: {
    assignmentId?: string;
    assignmentSource?: Assignment["source"];
    assignmentSourceType?: Assignment["sourceType"];
    assignmentSourceId?: string;
    assignmentSourceName?: string;
    assignment?: Assignment;
    matchedGroupName?: string;
    scheduleStatus?: "active" | "inactive";
    scheduleReason?: string;
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
  sourceType: SchedulerCandidateSourceType;
  targetType: SchedulerCandidateTargetType;
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
  resolverVersion?: string;
  totalCandidatesDiscovered: number;
  totalCandidatesEvaluated: number;
  winningCandidate: SchedulerCandidate | null;
  orderedEvaluationList: SchedulerResolutionTraceEntry[];
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
  rejectedCandidates?: RejectedSchedulerCandidate[];
  winningCandidate: SchedulerCandidate | null;
  reason: string;
  trace?: SchedulerResolutionTrace;
  resolvedProgram: Program | null;
  resolvedSchedule: SchedulerResolvedScheduleSummary;
}
