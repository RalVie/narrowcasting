import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

export interface ScreenRecord {
  screenId: string;
  playerId: string;
  name: string;
  status: "pending" | "approved";
  assignedProgramId?: string | null;
  assignedProgramName?: string | null;
  lastAssignment?: string | null;
  registeredAt: string;
  lastSeen: string;
  version: string;
  hostname: string;
  resolution: string;
  orientation: "landscape" | "portrait" | "unknown";
  userAgent: string;
  heartbeat?: ScreenHeartbeat;
  connectionStatus?: "online" | "offline";
  healthStatus?: "healthy" | "warning" | "offline";
  heartbeatAgeSeconds?: number | null;
}

export interface ScreenRegistrationInput {
  playerId?: unknown;
  hostname?: unknown;
  userAgent?: unknown;
  resolution?: unknown;
  orientation?: unknown;
  version?: unknown;
}

export interface ScreenHeartbeat {
  screenId: string;
  playerId: string;
  hostname: string | null;
  softwareVersion: string | null;
  uptime: number | null;
  currentTime: string | null;
  lastSeen: string;
  currentProgram: string | null;
  currentPlaylist: string | null;
  currentMedia: string | null;
  currentMediaType: string | null;
  playState: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskFree: number | null;
  networkIp: string | null;
  resolution: string | null;
  orientation: "landscape" | "portrait" | "unknown";
  syncStatus: string | null;
  lastScheduleSync: string | null;
  lastScheduleSignature: string | null;
  playbackError?: string | null;
}

const screensPath = resolve(process.cwd(), "data", "screens.json");
const offlineThresholdMs = 30_000;

function sanitizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function normalizeOrientation(value: unknown): ScreenRecord["orientation"] {
  return value === "landscape" || value === "portrait" ? value : "unknown";
}

function sanitizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function normalizeHeartbeat(value: unknown): ScreenHeartbeat | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ScreenHeartbeat>;

  if (typeof candidate.screenId !== "string" || typeof candidate.playerId !== "string") {
    return undefined;
  }

  return {
    screenId: candidate.screenId,
    playerId: candidate.playerId,
    hostname: sanitizeNullableText(candidate.hostname),
    softwareVersion: sanitizeNullableText(candidate.softwareVersion),
    uptime: sanitizeNumber(candidate.uptime),
    currentTime: sanitizeNullableText(candidate.currentTime),
    lastSeen: sanitizeText(candidate.lastSeen, new Date().toISOString()),
    currentProgram: sanitizeNullableText(candidate.currentProgram),
    currentPlaylist: sanitizeNullableText(candidate.currentPlaylist),
    currentMedia: sanitizeNullableText(candidate.currentMedia),
    currentMediaType: sanitizeNullableText(candidate.currentMediaType),
    playState: sanitizeNullableText(candidate.playState),
    cpuUsage: sanitizeNumber(candidate.cpuUsage),
    memoryUsage: sanitizeNumber(candidate.memoryUsage),
    diskFree: sanitizeNumber(candidate.diskFree),
    networkIp: sanitizeNullableText(candidate.networkIp),
    resolution: sanitizeNullableText(candidate.resolution),
    orientation: normalizeOrientation(candidate.orientation),
    syncStatus: sanitizeNullableText(candidate.syncStatus),
    lastScheduleSync: sanitizeNullableText(candidate.lastScheduleSync),
    lastScheduleSignature: sanitizeNullableText(candidate.lastScheduleSignature),
    playbackError: sanitizeNullableText(candidate.playbackError)
  };
}

function withDerivedStatus(screen: ScreenRecord): ScreenRecord {
  const lastSeen = Date.parse(screen.lastSeen);
  const heartbeatAgeSeconds = Number.isFinite(lastSeen)
    ? Math.max(0, Math.round((Date.now() - lastSeen) / 1000))
    : null;
  const connectionStatus =
    heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= offlineThresholdMs / 1000 ? "online" : "offline";
  const healthStatus =
    connectionStatus === "offline"
      ? "offline"
      : screen.heartbeat?.playbackError || screen.heartbeat?.syncStatus === "error"
        ? "warning"
        : "healthy";

  return {
    ...screen,
    connectionStatus,
    healthStatus,
    heartbeatAgeSeconds
  };
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
    assignedProgramId: sanitizeNullableText(candidate.assignedProgramId),
    assignedProgramName: sanitizeNullableText(candidate.assignedProgramName),
    lastAssignment: sanitizeNullableText(candidate.lastAssignment),
    registeredAt: sanitizeText(candidate.registeredAt, candidate.lastSeen ?? ""),
    lastSeen: sanitizeText(candidate.lastSeen, ""),
    version: sanitizeText(candidate.version, "unknown"),
    hostname: sanitizeText(candidate.hostname, "unknown"),
    resolution: sanitizeText(candidate.resolution, "unknown"),
    orientation: normalizeOrientation(candidate.orientation),
    userAgent: sanitizeText(candidate.userAgent, "unknown"),
    heartbeat: normalizeHeartbeat(candidate.heartbeat)
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
        .filter((screen): screen is ScreenRecord => screen !== null)
        .map(withDerivedStatus);
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
    assignedProgramId: existingScreen?.assignedProgramId ?? null,
    assignedProgramName: existingScreen?.assignedProgramName ?? null,
    lastAssignment: existingScreen?.lastAssignment ?? null,
    registeredAt: existingScreen?.registeredAt ?? now,
    lastSeen: now,
    version: sanitizeText(input.version, existingScreen?.version ?? "unknown"),
    hostname: sanitizeText(input.hostname, existingScreen?.hostname ?? "unknown"),
    resolution: sanitizeText(input.resolution, existingScreen?.resolution ?? "unknown"),
    orientation: normalizeOrientation(input.orientation ?? existingScreen?.orientation),
    userAgent: sanitizeText(input.userAgent, existingScreen?.userAgent ?? "unknown"),
    heartbeat: existingScreen?.heartbeat
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

export async function getScreenById(screenId: string): Promise<ScreenRecord | null> {
  const screens = await listScreens();
  return screens.find((screen) => screen.screenId === screenId) ?? null;
}

export async function updateScreenHeartbeat(
  screenId: string,
  input: unknown
): Promise<ScreenRecord | null> {
  const screens = await listScreens();
  const screen = screens.find((item) => item.screenId === screenId);

  if (!screen) {
    return null;
  }

  const heartbeat = normalizeHeartbeat({
    ...(input && typeof input === "object" ? input : {}),
    screenId,
    lastSeen: new Date().toISOString()
  });

  if (!heartbeat || heartbeat.playerId !== screen.playerId) {
    return null;
  }

  const updatedScreen: ScreenRecord = {
    ...screen,
    lastSeen: heartbeat.lastSeen,
    version: heartbeat.softwareVersion ?? screen.version,
    hostname: heartbeat.hostname ?? screen.hostname,
    resolution: heartbeat.resolution ?? screen.resolution,
    orientation: heartbeat.orientation,
    heartbeat
  };

  await writeScreens(screens.map((item) => (item.screenId === screenId ? updatedScreen : item)));
  return withDerivedStatus(updatedScreen);
}
