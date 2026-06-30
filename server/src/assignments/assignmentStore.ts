import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getProgramsOrDefault } from "../program/programStore.js";
import { listScreenGroups } from "../screens/screenGroupStore.js";
import { listScreens } from "../screens/screenStore.js";
import {
  assertValid,
  isPlainObject,
  isValidClockTime,
  isValidDateBoundary,
  type DomainValidationIssue
} from "../validation/domainValidation.js";

export type AssignmentTargetType = "SCREEN" | "SCREEN_GROUP";
export type AssignmentSource = "manual" | "campaign";
export type AssignmentSourceType = AssignmentSource;

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
  source: AssignmentSource;
  sourceType: AssignmentSourceType;
  sourceId?: string;
  sourceName?: string;
  generatedAt?: string;
  schedule?: AssignmentSchedule;
  priority?: number;
  createdAt: string;
  updatedAt: string;
}

export class AssignmentOwnershipError extends Error {
  code = "ASSIGNMENT_MANAGED_BY_CAMPAIGN" as const;

  constructor(
    public assignment: Assignment,
    action: "update" | "delete"
  ) {
    super(`Assignment cannot be manually ${action}d because it is managed by campaign.`);
  }
}

const assignmentsPath = resolve(process.cwd(), "data", "assignments.json");

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function normalizeTargetType(value: unknown): AssignmentTargetType | null {
  return value === "SCREEN" || value === "SCREEN_GROUP" ? value : null;
}

function normalizeSource(value: unknown): AssignmentSource {
  return value === "campaign" ? "campaign" : "manual";
}

function normalizeSourceType(value: unknown, fallback: AssignmentSource): AssignmentSourceType {
  return value === "campaign" || value === "manual" ? value : fallback;
}

function normalizePriority(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000 ? value : undefined;
}

function campaignIdFromGeneratedAssignmentId(id: string) {
  const match = /^campaign:([^:]+):/.exec(id);
  return match?.[1];
}

export function isCampaignManagedAssignment(assignment: Assignment) {
  return assignment.sourceType === "campaign";
}

function assertManualAssignmentMutation(assignment: Assignment, action: "update" | "delete") {
  if (isCampaignManagedAssignment(assignment)) {
    throw new AssignmentOwnershipError(assignment, action);
  }
}

function normalizeSchedule(value: unknown): AssignmentSchedule | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<AssignmentSchedule>;
  const datePattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  const timePattern = /^\d{2}:\d{2}$/;
  const schedule: AssignmentSchedule = {
    enabled: candidate.enabled !== false
  };

  if (typeof candidate.startDate === "string" && datePattern.test(candidate.startDate)) {
    schedule.startDate = candidate.startDate;
  }

  if (typeof candidate.endDate === "string" && datePattern.test(candidate.endDate)) {
    schedule.endDate = candidate.endDate;
  }

  if (Array.isArray(candidate.daysOfWeek)) {
    schedule.daysOfWeek = Array.from(
      new Set(
        candidate.daysOfWeek.filter(
          (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6
        )
      )
    );
  }

  if (typeof candidate.startTime === "string" && timePattern.test(candidate.startTime)) {
    schedule.startTime = candidate.startTime;
  }

  if (typeof candidate.endTime === "string" && timePattern.test(candidate.endTime)) {
    schedule.endTime = candidate.endTime;
  }

  return schedule;
}

function normalizeAssignment(value: unknown): Assignment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Assignment>;
  const targetType = normalizeTargetType(candidate.targetType);

  if (
    typeof candidate.id !== "string" ||
    !targetType ||
    typeof candidate.targetId !== "string" ||
    typeof candidate.programId !== "string"
  ) {
    return null;
  }

  const now = new Date().toISOString();

  const sourceType = normalizeSourceType(candidate.sourceType, normalizeSource(candidate.source));
  const source = sourceType;
  const sourceId =
    sanitizeText(candidate.sourceId) ||
    (sourceType === "campaign" ? campaignIdFromGeneratedAssignmentId(candidate.id) : undefined);

  return {
    id: candidate.id,
    targetType,
    targetId: candidate.targetId,
    programId: candidate.programId,
    enabled: candidate.enabled !== false,
    source,
    sourceType,
    sourceId,
    sourceName: sanitizeText(candidate.sourceName) || undefined,
    generatedAt: sanitizeText(candidate.generatedAt) || undefined,
    schedule: normalizeSchedule(candidate.schedule),
    priority: normalizePriority(candidate.priority),
    createdAt: sanitizeText(candidate.createdAt, now),
    updatedAt: sanitizeText(candidate.updatedAt, candidate.createdAt ?? now)
  };
}

async function writeAssignments(assignments: Assignment[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(assignmentsPath, `${JSON.stringify(assignments, null, 2)}\n`, "utf8");
}

async function readAssignmentsFile(): Promise<{ exists: boolean; assignments: Assignment[] }> {
  try {
    const content = await readFile(assignmentsPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return {
        exists: true,
        assignments: value
          .map((assignment) => normalizeAssignment(assignment))
          .filter((assignment): assignment is Assignment => assignment !== null)
      };
    }

    return { exists: true, assignments: [] };
  } catch {
    return { exists: false, assignments: [] };
  }
}

async function migrateLegacyScreenAssignments(): Promise<Assignment[]> {
  const screens = await listScreens();
  const now = new Date().toISOString();
  const assignments = screens
    .filter((screen) => screen.status === "approved" && screen.assignedProgramId)
    .map((screen) => ({
      id: randomUUID(),
      targetType: "SCREEN" as const,
      targetId: screen.screenId,
      programId: screen.assignedProgramId as string,
      enabled: true,
      source: "manual" as const,
      sourceType: "manual" as const,
      schedule: undefined,
      priority: undefined,
      createdAt: screen.lastAssignment ?? now,
      updatedAt: screen.lastAssignment ?? now
    }));

  if (assignments.length > 0) {
    await writeAssignments(assignments);
  }

  return assignments;
}

export async function listAssignments(): Promise<Assignment[]> {
  const file = await readAssignmentsFile();

  if (file.exists) {
    return file.assignments;
  }

  return migrateLegacyScreenAssignments();
}

async function validateAssignmentTarget(targetType: AssignmentTargetType, targetId: string) {
  if (targetType === "SCREEN") {
    const screens = await listScreens();
    const screen = screens.find((item) => item.screenId === targetId && item.status === "approved");

    if (!screen) {
      assertValid([
        {
          ruleId: "VAL-ASSIGN-002",
          field: "targetId",
          severity: "blocking_error",
          message: "Assignment target screen must exist and be approved."
        }
      ]);
    }

    return;
  }

  const groups = await listScreenGroups();
  const group = groups.find((item) => item.groupId === targetId);

  if (!group) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-002",
        field: "targetId",
        severity: "blocking_error",
        message: "Assignment target screen group must exist."
      }
    ]);
  }
}

async function validateProgram(programId: string) {
  const programs = await getProgramsOrDefault();
  const program = programs.find((item) => item.id === programId);

  if (!program) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-003",
        field: "programId",
        severity: "blocking_error",
        message: "Assignment program must exist."
      }
    ]);
  }
}

function validateAssignmentScheduleInput(value: unknown): DomainValidationIssue[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!isPlainObject(value)) {
    return [
      {
        ruleId: "VAL-ASSIGN-004",
        field: "schedule",
        severity: "blocking_error",
        message: "Assignment schedule must be an object."
      }
    ];
  }

  const issues: DomainValidationIssue[] = [];

  if ("enabled" in value && typeof value.enabled !== "boolean") {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.enabled",
      severity: "blocking_error",
      message: "Assignment schedule enabled must be true or false."
    });
  }

  if ("startDate" in value && typeof value.startDate !== "string") {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.startDate",
      severity: "blocking_error",
      message: "Assignment schedule start date must be a string."
    });
  }

  if (typeof value.startDate === "string" && !isValidDateBoundary(value.startDate)) {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.startDate",
      severity: "blocking_error",
      message: "Assignment schedule start date must be a valid ISO date."
    });
  }

  if ("endDate" in value && typeof value.endDate !== "string") {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.endDate",
      severity: "blocking_error",
      message: "Assignment schedule end date must be a string."
    });
  }

  if (typeof value.endDate === "string" && !isValidDateBoundary(value.endDate)) {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.endDate",
      severity: "blocking_error",
      message: "Assignment schedule end date must be a valid ISO date."
    });
  }

  if (
    typeof value.startDate === "string" &&
    typeof value.endDate === "string" &&
    isValidDateBoundary(value.startDate) &&
    isValidDateBoundary(value.endDate) &&
    Date.parse(value.startDate) > Date.parse(value.endDate)
  ) {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.endDate",
      severity: "blocking_error",
      message: "Assignment schedule end date must not be before the start date."
    });
  }

  if (value.daysOfWeek !== undefined) {
    if (!Array.isArray(value.daysOfWeek)) {
      issues.push({
        ruleId: "VAL-ASSIGN-004",
        field: "schedule.daysOfWeek",
        severity: "blocking_error",
        message: "Assignment schedule daysOfWeek must be an array."
      });
    } else {
      value.daysOfWeek.forEach((day, index) => {
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          issues.push({
            ruleId: "VAL-ASSIGN-004",
            field: `schedule.daysOfWeek[${index}]`,
            severity: "blocking_error",
            message: "Assignment schedule days must be numbers from 0 to 6."
          });
        }
      });
    }
  }

  if (typeof value.startTime === "string" && !isValidClockTime(value.startTime)) {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.startTime",
      severity: "blocking_error",
      message: "Assignment schedule start time must use HH:mm format."
    });
  }

  if (typeof value.endTime === "string" && !isValidClockTime(value.endTime)) {
    issues.push({
      ruleId: "VAL-ASSIGN-004",
      field: "schedule.endTime",
      severity: "blocking_error",
      message: "Assignment schedule end time must use HH:mm format."
    });
  }

  return issues;
}

function readAssignmentInput(input: unknown) {
  const body = input && typeof input === "object" ? (input as Partial<Assignment>) : {};
  const targetType = normalizeTargetType(body.targetType);
  const targetId = sanitizeText(body.targetId);
  const programId = sanitizeText(body.programId);

  if (!targetType) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-002",
        field: "targetType",
        severity: "blocking_error",
        message: "Assignment target type must be SCREEN or SCREEN_GROUP."
      }
    ]);
  }
  const validTargetType = targetType ?? "SCREEN";

  if (!targetId) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-002",
        field: "targetId",
        severity: "blocking_error",
        message: "Assignment target is required."
      }
    ]);
  }

  if (!programId) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-003",
        field: "programId",
        severity: "blocking_error",
        message: "Assignment program is required."
      }
    ]);
  }

  assertValid(validateAssignmentScheduleInput(body.schedule));

  return {
    targetType: validTargetType,
    targetId,
    programId,
    enabled: body.enabled !== false,
    schedule: normalizeSchedule(body.schedule)
  };
}

export async function createAssignment(input: unknown): Promise<Assignment> {
  const next = readAssignmentInput(input);
  await Promise.all([
    validateAssignmentTarget(next.targetType, next.targetId),
    validateProgram(next.programId)
  ]);

  const assignments = await listAssignments();
  const existing = assignments.find(
    (assignment) =>
      assignment.sourceType === "manual" &&
      assignment.targetType === next.targetType &&
      assignment.targetId === next.targetId
  );
  const now = new Date().toISOString();

  const assignment: Assignment = {
    id: existing?.id ?? randomUUID(),
    targetType: next.targetType,
    targetId: next.targetId,
    programId: next.programId,
    enabled: next.enabled,
    source: "manual",
    sourceType: "manual",
    sourceId: undefined,
    sourceName: undefined,
    generatedAt: undefined,
    schedule: next.schedule,
    priority: undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  await writeAssignments(
    existing
      ? assignments.map((item) => (item.id === existing.id ? assignment : item))
      : [...assignments, assignment]
  );
  return assignment;
}

export async function updateAssignment(id: string, input: unknown): Promise<Assignment | null> {
  const assignments = await listAssignments();
  const existing = assignments.find((assignment) => assignment.id === id);

  if (!existing) {
    return null;
  }

  assertManualAssignmentMutation(existing, "update");

  const body = input && typeof input === "object" ? (input as Partial<Assignment>) : {};
  if ("targetType" in body && !normalizeTargetType(body.targetType)) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-002",
        field: "targetType",
        severity: "blocking_error",
        message: "Assignment target type must be SCREEN or SCREEN_GROUP."
      }
    ]);
  }
  const targetType = normalizeTargetType(body.targetType) ?? existing.targetType;
  const targetId = sanitizeText(body.targetId, existing.targetId);
  const programId = sanitizeText(body.programId, existing.programId);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : existing.enabled;
  assertValid("schedule" in body ? validateAssignmentScheduleInput(body.schedule) : []);
  const schedule = "schedule" in body ? normalizeSchedule(body.schedule) : existing.schedule;

  await Promise.all([
    validateAssignmentTarget(targetType, targetId),
    validateProgram(programId)
  ]);

  const duplicate = assignments.find(
    (assignment) =>
      assignment.id !== id &&
      assignment.sourceType === existing.sourceType &&
      assignment.sourceId === existing.sourceId &&
      assignment.targetType === targetType &&
      assignment.targetId === targetId
  );

  if (duplicate) {
    assertValid([
      {
        ruleId: "VAL-ASSIGN-002",
        field: "targetId",
        severity: "blocking_error",
        message: "Target already has an assignment for this source."
      }
    ]);
  }

  const assignment: Assignment = {
    ...existing,
    targetType,
    targetId,
    programId,
    enabled,
    source: existing.source,
    sourceType: existing.sourceType,
    sourceId: existing.sourceId,
    sourceName: existing.sourceName,
    generatedAt: existing.generatedAt,
    schedule,
    priority: existing.priority,
    updatedAt: new Date().toISOString()
  };

  await writeAssignments(assignments.map((item) => (item.id === id ? assignment : item)));
  return assignment;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const assignments = await listAssignments();
  const existing = assignments.find((assignment) => assignment.id === id);

  if (!existing) {
    return false;
  }

  assertManualAssignmentMutation(existing, "delete");

  const nextAssignments = assignments.filter((assignment) => assignment.id !== id);

  await writeAssignments(nextAssignments);
  return true;
}

export async function syncCampaignAssignments(input: {
  campaignId: string;
  enabled: boolean;
  targetType: AssignmentTargetType;
  targetIds: string[];
  programId: string;
  campaignName: string;
  schedule?: AssignmentSchedule;
  priority?: number;
  createdAt: string;
  updatedAt: string;
}): Promise<Assignment[]> {
  await Promise.all([
    validateProgram(input.programId),
    ...input.targetIds.map((targetId) => validateAssignmentTarget(input.targetType, targetId))
  ]);

  const assignments = await listAssignments();
  const campaignPrefix = `campaign:${input.campaignId}:`;
  const retainedAssignments = assignments.filter(
    (assignment) =>
      !(
        assignment.sourceType === "campaign" &&
        (assignment.sourceId === input.campaignId || assignment.id.startsWith(campaignPrefix))
      )
  );
  const nextCampaignAssignments = input.enabled
    ? input.targetIds.map((targetId) => {
        const id = `${campaignPrefix}${input.targetType}:${targetId}`;
        const existing = assignments.find((assignment) => assignment.id === id);

        return {
          id,
          targetType: input.targetType,
          targetId,
          programId: input.programId,
          enabled: true,
          source: "campaign" as const,
          sourceType: "campaign" as const,
          sourceId: input.campaignId,
          sourceName: input.campaignName,
          generatedAt: existing?.generatedAt ?? input.createdAt,
          schedule: input.schedule,
          priority: input.priority,
          createdAt: existing?.createdAt ?? input.createdAt,
          updatedAt: input.updatedAt
        };
      })
    : [];
  const nextAssignments = [...retainedAssignments, ...nextCampaignAssignments];

  await writeAssignments(nextAssignments);
  return nextCampaignAssignments;
}

export async function deleteCampaignAssignments(campaignId: string): Promise<void> {
  const assignments = await listAssignments();
  const campaignPrefix = `campaign:${campaignId}:`;
  const nextAssignments = assignments.filter(
    (assignment) =>
      !(
        assignment.sourceType === "campaign" &&
        (assignment.sourceId === campaignId || assignment.id.startsWith(campaignPrefix))
      )
  );

  await writeAssignments(nextAssignments);
}
