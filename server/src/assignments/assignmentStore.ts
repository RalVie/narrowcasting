import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getProgramsOrDefault, type Program } from "../program/programStore.js";
import { listScreenGroups } from "../screens/screenGroupStore.js";
import { listScreens } from "../screens/screenStore.js";

export type AssignmentTargetType = "SCREEN" | "SCREEN_GROUP";
export type AssignmentSource = "manual" | "campaign";

export interface Assignment {
  id: string;
  targetType: AssignmentTargetType;
  targetId: string;
  programId: string;
  enabled: boolean;
  source: AssignmentSource;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedAssignment {
  assignment: Assignment;
  program: Program | null;
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

  return {
    id: candidate.id,
    targetType,
    targetId: candidate.targetId,
    programId: candidate.programId,
    enabled: candidate.enabled !== false,
    source: normalizeSource(candidate.source),
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
      throw new Error("target screen must be approved");
    }

    return;
  }

  const groups = await listScreenGroups();
  const group = groups.find((item) => item.groupId === targetId);

  if (!group) {
    throw new Error("target screen group not found");
  }
}

async function validateProgram(programId: string) {
  const programs = await getProgramsOrDefault();
  const program = programs.find((item) => item.id === programId);

  if (!program) {
    throw new Error("program not found");
  }
}

function readAssignmentInput(input: unknown) {
  const body = input && typeof input === "object" ? (input as Partial<Assignment>) : {};
  const targetType = normalizeTargetType(body.targetType);
  const targetId = sanitizeText(body.targetId);
  const programId = sanitizeText(body.programId);

  if (!targetType) {
    throw new Error("targetType must be SCREEN or SCREEN_GROUP");
  }

  if (!targetId) {
    throw new Error("targetId is required");
  }

  if (!programId) {
    throw new Error("programId is required");
  }

  return {
    targetType,
    targetId,
    programId,
    enabled: body.enabled !== false,
    source: normalizeSource(body.source)
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
    (assignment) => assignment.targetType === next.targetType && assignment.targetId === next.targetId
  );
  const now = new Date().toISOString();

  const assignment: Assignment = {
    id: existing?.id ?? randomUUID(),
    targetType: next.targetType,
    targetId: next.targetId,
    programId: next.programId,
    enabled: next.enabled,
    source: next.source,
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

  const body = input && typeof input === "object" ? (input as Partial<Assignment>) : {};
  const targetType = normalizeTargetType(body.targetType) ?? existing.targetType;
  const targetId = sanitizeText(body.targetId, existing.targetId);
  const programId = sanitizeText(body.programId, existing.programId);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : existing.enabled;

  await Promise.all([
    validateAssignmentTarget(targetType, targetId),
    validateProgram(programId)
  ]);

  const duplicate = assignments.find(
    (assignment) =>
      assignment.id !== id &&
      assignment.targetType === targetType &&
      assignment.targetId === targetId
  );

  if (duplicate) {
    throw new Error("target already has an assignment");
  }

  const assignment: Assignment = {
    ...existing,
    targetType,
    targetId,
    programId,
    enabled,
    source: existing.source,
    updatedAt: new Date().toISOString()
  };

  await writeAssignments(assignments.map((item) => (item.id === id ? assignment : item)));
  return assignment;
}

export async function deleteAssignment(id: string): Promise<boolean> {
  const assignments = await listAssignments();
  const nextAssignments = assignments.filter((assignment) => assignment.id !== id);

  if (nextAssignments.length === assignments.length) {
    return false;
  }

  await writeAssignments(nextAssignments);
  return true;
}

export async function syncCampaignAssignments(input: {
  campaignId: string;
  enabled: boolean;
  targetType: AssignmentTargetType;
  targetIds: string[];
  programId: string;
  createdAt: string;
  updatedAt: string;
}): Promise<Assignment[]> {
  await Promise.all([
    validateProgram(input.programId),
    ...input.targetIds.map((targetId) => validateAssignmentTarget(input.targetType, targetId))
  ]);

  const assignments = await listAssignments();
  const campaignPrefix = `campaign:${input.campaignId}:`;
  const targetKeys = new Set(input.targetIds.map((targetId) => `${input.targetType}:${targetId}`));
  const retainedAssignments = assignments.filter((assignment) => {
    if (assignment.id.startsWith(campaignPrefix)) {
      return false;
    }

    return !input.enabled || !targetKeys.has(`${assignment.targetType}:${assignment.targetId}`);
  });
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
  const nextAssignments = assignments.filter((assignment) => !assignment.id.startsWith(campaignPrefix));

  await writeAssignments(nextAssignments);
}

export async function resolveAssignmentForScreen(screenId: string): Promise<ResolvedAssignment | null> {
  const [assignments, groups, programs] = await Promise.all([
    listAssignments(),
    listScreenGroups(),
    getProgramsOrDefault()
  ]);
  const enabledAssignments = assignments.filter((assignment) => assignment.enabled);
  const screenAssignment = enabledAssignments.find(
    (assignment) => assignment.targetType === "SCREEN" && assignment.targetId === screenId
  );
  const groupIds = groups
    .filter((group) => group.screenIds.includes(screenId))
    .map((group) => group.groupId);
  const groupAssignment = enabledAssignments.find(
    (assignment) => assignment.targetType === "SCREEN_GROUP" && groupIds.includes(assignment.targetId)
  );
  const assignment = screenAssignment ?? groupAssignment;

  if (!assignment) {
    return null;
  }

  return {
    assignment,
    program: programs.find((program) => program.id === assignment.programId) ?? null
  };
}
