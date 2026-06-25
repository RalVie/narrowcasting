export type AssignmentTargetType = "SCREEN" | "SCREEN_GROUP";

export interface Assignment {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  source: "manual" | "campaign";
  createdAt: string;
  updatedAt: string;
}
