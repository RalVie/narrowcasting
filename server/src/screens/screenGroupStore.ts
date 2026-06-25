import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listScreens } from "./screenStore.js";

export interface ScreenGroup {
  groupId: string;
  name: string;
  description?: string | null;
  screenIds: string[];
  createdAt: string;
  updatedAt: string;
}

const screenGroupsPath = resolve(process.cwd(), "data", "screen-groups.json");

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function sanitizeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function normalizeScreenIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((screenId): screenId is string => typeof screenId === "string" && screenId.trim().length > 0)
        .map((screenId) => screenId.trim())
    )
  );
}

function normalizeGroup(value: unknown): ScreenGroup | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ScreenGroup>;

  if (typeof candidate.groupId !== "string") {
    return null;
  }

  const now = new Date().toISOString();

  return {
    groupId: candidate.groupId,
    name: sanitizeText(candidate.name, "Unnamed Group"),
    description: sanitizeNullableText(candidate.description),
    screenIds: normalizeScreenIds(candidate.screenIds),
    createdAt: sanitizeText(candidate.createdAt, now),
    updatedAt: sanitizeText(candidate.updatedAt, candidate.createdAt ?? now)
  };
}

async function writeScreenGroups(groups: ScreenGroup[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(screenGroupsPath, `${JSON.stringify(groups, null, 2)}\n`, "utf8");
}

export async function listScreenGroups(): Promise<ScreenGroup[]> {
  try {
    const content = await readFile(screenGroupsPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value
        .map((group) => normalizeGroup(group))
        .filter((group): group is ScreenGroup => group !== null);
    }
  } catch {
    return [];
  }

  return [];
}

export async function createScreenGroup(input: unknown): Promise<ScreenGroup> {
  const body = input && typeof input === "object" ? (input as { name?: unknown; description?: unknown }) : {};
  const now = new Date().toISOString();
  const group: ScreenGroup = {
    groupId: randomUUID(),
    name: sanitizeText(body.name, "New Group"),
    description: sanitizeNullableText(body.description),
    screenIds: [],
    createdAt: now,
    updatedAt: now
  };

  const groups = await listScreenGroups();
  await writeScreenGroups([...groups, group]);
  return group;
}

export async function renameScreenGroup(groupId: string, input: unknown): Promise<ScreenGroup | null> {
  const groups = await listScreenGroups();
  const group = groups.find((item) => item.groupId === groupId);

  if (!group) {
    return null;
  }

  const body = input && typeof input === "object" ? (input as { name?: unknown; description?: unknown }) : {};
  const updatedGroup: ScreenGroup = {
    ...group,
    name: sanitizeText(body.name, group.name),
    description: sanitizeNullableText(body.description),
    updatedAt: new Date().toISOString()
  };

  await writeScreenGroups(groups.map((item) => (item.groupId === groupId ? updatedGroup : item)));
  return updatedGroup;
}

export async function deleteScreenGroup(groupId: string): Promise<boolean> {
  const groups = await listScreenGroups();
  const nextGroups = groups.filter((item) => item.groupId !== groupId);

  if (nextGroups.length === groups.length) {
    return false;
  }

  await writeScreenGroups(nextGroups);
  return true;
}

export async function addScreenToGroup(groupId: string, screenId: unknown): Promise<ScreenGroup | null> {
  const normalizedScreenId = sanitizeText(screenId);

  if (!normalizedScreenId) {
    throw new Error("screenId is required");
  }

  const screens = await listScreens();
  const approvedScreen = screens.find(
    (screen) => screen.screenId === normalizedScreenId && screen.status === "approved"
  );

  if (!approvedScreen) {
    throw new Error("screen must be approved before it can be added to a group");
  }

  const groups = await listScreenGroups();
  const group = groups.find((item) => item.groupId === groupId);

  if (!group) {
    return null;
  }

  const updatedGroup: ScreenGroup = {
    ...group,
    screenIds: Array.from(new Set([...group.screenIds, normalizedScreenId])),
    updatedAt: new Date().toISOString()
  };

  await writeScreenGroups(groups.map((item) => (item.groupId === groupId ? updatedGroup : item)));
  return updatedGroup;
}

export async function removeScreenFromGroup(groupId: string, screenId: unknown): Promise<ScreenGroup | null> {
  const normalizedScreenId = sanitizeText(screenId);
  const groups = await listScreenGroups();
  const group = groups.find((item) => item.groupId === groupId);

  if (!group) {
    return null;
  }

  const updatedGroup: ScreenGroup = {
    ...group,
    screenIds: group.screenIds.filter((item) => item !== normalizedScreenId),
    updatedAt: new Date().toISOString()
  };

  await writeScreenGroups(groups.map((item) => (item.groupId === groupId ? updatedGroup : item)));
  return updatedGroup;
}
