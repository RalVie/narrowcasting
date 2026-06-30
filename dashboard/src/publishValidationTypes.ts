export type PublishValidationSeverity = "blocking_error" | "warning" | "info";

export interface PublishValidationMessage {
  id: string;
  severity: PublishValidationSeverity;
  category: "media" | "playlist" | "program" | "theme" | "assignment" | "campaign" | "deployment";
  ruleId: string;
  message: string;
  affectedObject?: {
    type: string;
    id: string;
    name?: string;
  };
  suggestedFix?: string;
}

export type PublishImpactResult = "wins" | "loses" | "no_assignment" | "unknown";

export interface PublishImpactScreen {
  screenId: string;
  screenName: string;
  targetSource: {
    type: "SCREEN" | "SCREEN_GROUP";
    id: string;
    name?: string;
  };
  result: PublishImpactResult;
  winningAssignmentId?: string | null;
  winningAssignmentSourceType?: "manual" | "campaign" | null;
  winningProgramId?: string | null;
  winningProgramName?: string | null;
  reason: string;
  severity: PublishValidationSeverity;
}

export interface PublishImpactReport {
  summary: {
    affectedScreens: number;
    wins: number;
    loses: number;
    noAssignment: number;
    unknown: number;
  };
  screens: PublishImpactScreen[];
}

export interface PublishValidationReport {
  status: "ready" | "warnings" | "blocked";
  summary: {
    blockingErrors: number;
    warnings: number;
    information: number;
  };
  blockingErrors: PublishValidationMessage[];
  warnings: PublishValidationMessage[];
  information: PublishValidationMessage[];
  affectedObjects: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  suggestedFixes: string[];
  impact?: PublishImpactReport;
  generatedAt: string;
}
