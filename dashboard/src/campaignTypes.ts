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
  revision?: string | null;
  alwaysActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  daysOfWeek?: string[];
  startTime?: string | null;
  endTime?: string | null;
  timeWindows?: unknown[];
  priority: number;
  overrideMode?: string | null;
  rotation?: string | null;
  weight?: number | null;
  campaignType?: string | null;
}
