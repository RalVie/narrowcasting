import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { listMedia } from "../media/mediaStore.js";
import { readPlaylist } from "../playlist/playlistStore.js";
import { getScheduleFromPlaylist } from "../playlist/playlistStore.js";

export interface CachedMediaFile {
  filename: string;
  size: number;
}

export interface AgentStatus {
  lastSync: string | null;
  currentScheduleVersion: number | null;
  cachedFiles: number;
}

const playerMediaDir = resolve(process.cwd(), "..", "player", "public", "media");
const agentStatusPath = resolve(process.cwd(), "data", "agent-status.json");

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
      cachedFiles: typeof value.cachedFiles === "number" ? value.cachedFiles : 0
    };
  } catch {
    return {
      lastSync: null,
      currentScheduleVersion: null,
      cachedFiles: 0
    };
  }
}

export async function getSystemStatus() {
  const [schedule, playlist, media] = await Promise.all([
    getScheduleFromPlaylist(),
    readPlaylist(),
    listMedia()
  ]);

  return {
    server: "online",
    scheduleVersion: schedule.version,
    playlistVersion: playlist?.version ?? null,
    mediaCount: media.length
  };
}
