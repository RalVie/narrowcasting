import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export interface ScreenRecord {
  screenId: string;
  playerId: string;
  name: string;
  status: "pending" | "approved";
  lastSeen: string;
  version: string;
  hostname: string;
  resolution: string;
  orientation: "landscape" | "portrait" | "unknown";
  userAgent: string;
}

export interface ScreenRegistrationInput {
  playerId?: unknown;
  hostname?: unknown;
  userAgent?: unknown;
  resolution?: unknown;
  orientation?: unknown;
  version?: unknown;
}

const screensPath = resolve(process.cwd(), "data", "screens.json");

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function normalizeOrientation(value: unknown): ScreenRecord["orientation"] {
  return value === "landscape" || value === "portrait" ? value : "unknown";
}

function normalizeScreen(value: unknown): ScreenRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ScreenRecord>;

  if (typeof candidate.screenId !== "string" || typeof candidate.playerId !== "string") {
    return null;
  }

  return {
    screenId: candidate.screenId,
    playerId: candidate.playerId,
    name: sanitizeText(candidate.name, "Unnamed Screen"),
    status: candidate.status === "approved" ? "approved" : "pending",
    lastSeen: sanitizeText(candidate.lastSeen, ""),
    version: sanitizeText(candidate.version, "unknown"),
    hostname: sanitizeText(candidate.hostname, "unknown"),
    resolution: sanitizeText(candidate.resolution, "unknown"),
    orientation: normalizeOrientation(candidate.orientation),
    userAgent: sanitizeText(candidate.userAgent, "unknown")
  };
}

async function writeScreens(screens: ScreenRecord[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(screensPath, `${JSON.stringify(screens, null, 2)}\n`, "utf8");
}

export async function listScreens(): Promise<ScreenRecord[]> {
  try {
    const content = await readFile(screensPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value
        .map((screen) => normalizeScreen(screen))
        .filter((screen): screen is ScreenRecord => screen !== null);
    }
  } catch {
    return [];
  }

  return [];
}

export async function registerScreen(input: ScreenRegistrationInput): Promise<ScreenRecord> {
  const playerId = sanitizeText(input.playerId);

  if (!playerId) {
    throw new Error("playerId is required");
  }

  const screens = await listScreens();
  const existingScreen = screens.find((screen) => screen.playerId === playerId);
  const now = new Date().toISOString();
  const screen: ScreenRecord = {
    screenId: existingScreen?.screenId ?? randomUUID(),
    playerId,
    name: existingScreen?.name ?? `Screen ${screens.length + 1}`,
    status: existingScreen?.status ?? "pending",
    lastSeen: now,
    version: sanitizeText(input.version, existingScreen?.version ?? "unknown"),
    hostname: sanitizeText(input.hostname, existingScreen?.hostname ?? "unknown"),
    resolution: sanitizeText(input.resolution, existingScreen?.resolution ?? "unknown"),
    orientation: normalizeOrientation(input.orientation ?? existingScreen?.orientation),
    userAgent: sanitizeText(input.userAgent, existingScreen?.userAgent ?? "unknown")
  };

  await writeScreens(
    existingScreen
      ? screens.map((item) => (item.screenId === screen.screenId ? screen : item))
      : [...screens, screen]
  );

  return screen;
}

export async function approveScreen(screenId: string): Promise<ScreenRecord | null> {
  const screens = await listScreens();
  const screen = screens.find((item) => item.screenId === screenId);

  if (!screen) {
    return null;
  }

  const approvedScreen: ScreenRecord = {
    ...screen,
    status: "approved"
  };

  await writeScreens(screens.map((item) => (item.screenId === screenId ? approvedScreen : item)));
  return approvedScreen;
}

export async function renameScreen(screenId: string, name: unknown): Promise<ScreenRecord | null> {
  const screens = await listScreens();
  const screen = screens.find((item) => item.screenId === screenId);

  if (!screen) {
    return null;
  }

  const renamedScreen: ScreenRecord = {
    ...screen,
    name: sanitizeText(name, screen.name)
  };

  await writeScreens(screens.map((item) => (item.screenId === screenId ? renamedScreen : item)));
  return renamedScreen;
}
