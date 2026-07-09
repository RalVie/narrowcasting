import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listPlaylists } from "../playlist/playlistStore.js";
import { listThemes } from "../theme/themeStore.js";
import { assertValid, isPlainObject, type DomainValidationIssue } from "../validation/domainValidation.js";

export interface Program {
  id: string;
  name: string;
  playlistIds: string[];
  themeId?: string;
  options?: Record<string, unknown>;
}

const programsPath = resolve(process.cwd(), "data", "programs.json");
const defaultProgramId = "default-program";

function toProgramId(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `program-${Date.now()}`;
}

function normalizeProgram(value: unknown, fallbackIndex: number): Program | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Program>;

  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? toProgramId(candidate.id)
        : fallbackIndex === 0
          ? defaultProgramId
          : toProgramId(candidate.name),
    name: candidate.name.trim(),
    playlistIds: Array.isArray(candidate.playlistIds)
      ? candidate.playlistIds.filter((playlistId): playlistId is string => typeof playlistId === "string")
      : [],
    themeId: typeof candidate.themeId === "string" && candidate.themeId.trim() ? candidate.themeId.trim() : undefined,
    options: candidate.options && typeof candidate.options === "object" ? candidate.options : undefined
  };
}

async function validateProgramWrite(value: unknown) {
  const body = isPlainObject(value) ? value : {};
  const issues: DomainValidationIssue[] = [];

  if ("name" in body && (typeof body.name !== "string" || !body.name.trim())) {
    issues.push({
      ruleId: "VAL-PROGRAM-001",
      field: "name",
      severity: "blocking_error",
      message: "Program name is required."
    });
  }

  if (body.playlistIds !== undefined && !Array.isArray(body.playlistIds)) {
    issues.push({
      ruleId: "VAL-PROGRAM-002",
      field: "playlistIds",
      severity: "blocking_error",
      message: "Program playlistIds must be an array."
    });
  }

  if (Array.isArray(body.playlistIds)) {
    const playlists = await listPlaylists();
    const playlistIds = new Set(playlists.map((playlist) => playlist.id));

    body.playlistIds.forEach((playlistId, index) => {
      if (typeof playlistId !== "string" || !playlistId.trim()) {
        issues.push({
          ruleId: "VAL-PROGRAM-002",
          field: `playlistIds[${index}]`,
          severity: "blocking_error",
          message: "Program playlist reference must be a valid playlist ID."
        });
        return;
      }

      if (!playlistIds.has(playlistId)) {
        issues.push({
          ruleId: "VAL-PROGRAM-002",
          field: `playlistIds[${index}]`,
          severity: "blocking_error",
          message: "Program playlist reference must exist."
        });
      }
    });
  }

  if ("themeId" in body && body.themeId !== undefined && body.themeId !== null && body.themeId !== "") {
    if (typeof body.themeId !== "string" || !body.themeId.trim()) {
      issues.push({
        ruleId: "VAL-PROGRAM-003",
        field: "themeId",
        severity: "blocking_error",
        message: "Program theme reference must be a valid theme ID."
      });
    } else {
      const themes = await listThemes();
      const themeIds = new Set(themes.map((theme) => theme.id));

      if (!themeIds.has(body.themeId.trim())) {
        issues.push({
          ruleId: "VAL-PROGRAM-003",
          field: "themeId",
          severity: "blocking_error",
          message: "Program theme reference must exist."
        });
      }
    }
  }

  assertValid(issues);
}

async function writePrograms(programs: Program[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(programsPath, `${JSON.stringify(programs, null, 2)}\n`, "utf8");
}

export async function listPrograms(): Promise<Program[]> {
  try {
    const content = await readFile(programsPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      const programs = value
        .map((program, index) => normalizeProgram(program, index))
        .filter((program): program is Program => program !== null);

      if (programs.length > 0) {
        return programs;
      }
    }
  } catch {
    return [];
  }

  return [];
}

export async function getProgramsOrDefault(): Promise<Program[]> {
  const programs = await listPrograms();

  if (programs.length > 0) {
    return programs;
  }

  return [
    {
      id: defaultProgramId,
      name: "Default Program",
      playlistIds: ["default"]
    }
  ];
}

export async function createProgram(value: unknown): Promise<Program> {
  await validateProgramWrite(value);
  const programs = await getProgramsOrDefault();
  const incoming = value as Partial<Program>;
  const name = typeof incoming.name === "string" && incoming.name.trim() ? incoming.name.trim() : "New Program";
  const baseId = toProgramId(typeof incoming.id === "string" ? incoming.id : name);
  const existingIds = new Set(programs.map((program) => program.id));
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const program: Program = {
    id,
    name,
    playlistIds: Array.isArray(incoming.playlistIds)
      ? incoming.playlistIds.filter((playlistId): playlistId is string => typeof playlistId === "string")
      : [],
    themeId: typeof incoming.themeId === "string" && incoming.themeId.trim() ? incoming.themeId.trim() : undefined
  };

  await writePrograms([...programs, program]);
  return program;
}

export async function saveProgram(id: string, value: unknown): Promise<Program | null> {
  const programs = await getProgramsOrDefault();
  const existingProgram = programs.find((program) => program.id === id);

  if (!existingProgram) {
    return null;
  }

  await validateProgramWrite(value);

  const incoming = value as Partial<Program>;
  const program: Program = {
    id: existingProgram.id,
    name:
      typeof incoming.name === "string" && incoming.name.trim()
        ? incoming.name.trim()
        : existingProgram.name,
    playlistIds: Array.isArray(incoming.playlistIds)
      ? incoming.playlistIds.filter((playlistId): playlistId is string => typeof playlistId === "string")
      : existingProgram.playlistIds,
    themeId:
      typeof incoming.themeId === "string" && incoming.themeId.trim()
        ? incoming.themeId.trim()
        : incoming.themeId === null || incoming.themeId === ""
          ? undefined
          : existingProgram.themeId,
    options: incoming.options && typeof incoming.options === "object" ? incoming.options : existingProgram.options
  };

  await writePrograms(programs.map((item) => (item.id === id ? program : item)));
  return program;
}

export async function deleteProgram(id: string): Promise<boolean> {
  const programs = await getProgramsOrDefault();
  const nextPrograms = programs.filter((program) => program.id !== id);

  if (nextPrograms.length === programs.length) {
    return false;
  }

  await writePrograms(nextPrograms);
  return true;
}
