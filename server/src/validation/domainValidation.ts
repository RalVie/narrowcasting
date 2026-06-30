export interface DomainValidationIssue {
  ruleId: string;
  field?: string;
  severity: "blocking_error" | "warning";
  message: string;
}

export class DomainValidationError extends Error {
  code = "VALIDATION_FAILED" as const;

  constructor(public issues: DomainValidationIssue[]) {
    super(issues[0]?.message ?? "Validation failed");
  }
}

export function assertValid(issues: DomainValidationIssue[]) {
  if (issues.length > 0) {
    throw new DomainValidationError(issues);
  }
}

export function validationErrorResponse(error: DomainValidationError) {
  return {
    error: "validation_error",
    code: error.code,
    message: "Validation failed",
    errors: error.issues
  };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireText(value: unknown, field: string, ruleId: string, message: string) {
  return typeof value === "string" && value.trim()
    ? null
    : {
        ruleId,
        field,
        severity: "blocking_error" as const,
        message
      };
}

export function isValidDateBoundary(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

export function isValidClockTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
