export type AssignmentTargetType = "SCREEN" | "SCREEN_GROUP";

export interface Assignment {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
