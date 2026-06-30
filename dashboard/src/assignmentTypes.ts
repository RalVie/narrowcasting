export type AssignmentTargetType = "SCREEN" | "SCREEN_GROUP";

export interface AssignmentSchedule {
  enabled: boolean;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
}

export interface Assignment {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  source: "manual" | "campaign";
  sourceType: "manual" | "campaign";
  sourceId?: string;
  sourceName?: string;
  generatedAt?: string;
  schedule?: AssignmentSchedule;
  createdAt: string;
  updatedAt: string;
}
