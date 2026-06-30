import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listMedia } from "../media/mediaStore.js";
import { readPlaylist } from "../playlist/playlistStore.js";
import { getLegacyGeneratedSchedule } from "../scheduler/generatedSchedule.js";

export interface CachedMediaFile {
  filename: string;
  size: number;
}

export interface AgentStatus {
  lastSync: string | null;
  currentScheduleVersion: number | null;
  cachedFiles: number;
  syncStatus?: string | null;
  readinessState?: string | null;
  pendingScheduleVersion?: number | null;
  failedMedia?: Array<{
    file: string;
    error?: string;
  }>;
  lastError?: string | null;
}

const playerMediaDir = resolve(process.cwd(), "..", "player", "public", "media");
const agentStatusPath = resolve(process.cwd(), "data", "agent-status.json");
const instanceIdPath = resolve(process.cwd(), "data", "instance-id.json");
const applicationName = "Narrowcasting Server";
const applicationVersion = "phase-1";

async function readInstanceId() {
  try {
    const content = await readFile(instanceIdPath, "utf8");
    const value = JSON.parse(content) as { instanceId?: unknown };

    if (typeof value.instanceId === "string" && value.instanceId.trim()) {
      return value.instanceId;
    }
  } catch {
    // Create a stable server instance id below.
  }

  const instanceId = randomUUID();
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(instanceIdPath, `${JSON.stringify({ instanceId }, null, 2)}\n`, "utf8");
  return instanceId;
}

export async function listPlayerCachedMedia(): Promise<CachedMediaFile[]> {
  try {
    const filenames = await readdir(playerMediaDir);
    const files = await Promise.all(
      filenames
        .filter((filename) => !filename.startsWith("."))
        .map(async (filename): Promise<CachedMediaFile | null> => {
          const fileStat = await stat(resolve(playerMediaDir, filename));

          if (!fileStat.isFile()) {
            return null;
          }

          return {
            filename,
            size: fileStat.size
          };
        })
    );

    return files.filter((file): file is CachedMediaFile => file !== null);
  } catch {
    return [];
  }
}

export async function readAgentStatus(): Promise<AgentStatus> {
  try {
    const content = await readFile(agentStatusPath, "utf8");
    const value = JSON.parse(content) as Partial<AgentStatus>;

    return {
      lastSync: typeof value.lastSync === "string" ? value.lastSync : null,
      currentScheduleVersion:
        typeof value.currentScheduleVersion === "number" ? value.currentScheduleVersion : null,
      cachedFiles: typeof value.cachedFiles === "number" ? value.cachedFiles : 0,
      syncStatus: typeof value.syncStatus === "string" ? value.syncStatus : null,
      readinessState: typeof value.readinessState === "string" ? value.readinessState : null,
      pendingScheduleVersion:
        typeof value.pendingScheduleVersion === "number" ? value.pendingScheduleVersion : null,
      failedMedia: Array.isArray(value.failedMedia)
        ? value.failedMedia
            .filter((item) => item && typeof item === "object" && typeof item.file === "string")
            .map((item) => ({
              file: item.file,
              error: typeof item.error === "string" ? item.error : undefined
            }))
        : [],
      lastError: typeof value.lastError === "string" ? value.lastError : null
    };
  } catch {
    return {
      lastSync: null,
      currentScheduleVersion: null,
      cachedFiles: 0,
      syncStatus: null,
      readinessState: null,
      pendingScheduleVersion: null,
      failedMedia: [],
      lastError: null
    };
  }
}

export async function getSystemStatus() {
  const [schedule, playlist, media] = await Promise.all([
    getLegacyGeneratedSchedule(),
    readPlaylist(),
    listMedia()
  ]);

  return {
    application: applicationName,
    version: applicationVersion,
    instanceId: await readInstanceId(),
    hostname: hostname(),
    server: "online",
    scheduleVersion: schedule.version,
    playlistVersion: playlist?.version ?? null,
    mediaCount: media.length
  };
}
