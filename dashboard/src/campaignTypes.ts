import type { AssignmentTargetType } from "./assignmentTypes";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  programId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
  createdAt: string;
  updatedAt: string;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string[];
  timeWindows?: unknown[];
  priority?: number | null;
  overrideMode?: string | null;
  rotation?: string | null;
  weight?: number | null;
  campaignType?: string | null;
}
