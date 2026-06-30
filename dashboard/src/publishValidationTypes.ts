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
  generatedAt: string;
}
