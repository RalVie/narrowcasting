import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { AgentConfig } from "../config/loadAgentConfig.js";
import type { Schedule } from "../schedule/types.js";

function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const schedule = value as Partial<Schedule>;
  return (
    typeof schedule.version === "number" &&
    typeof schedule.updatedAt === "string" &&
    Array.isArray(schedule.items)
  );
}

async function fetchSchedule(config: AgentConfig): Promise<Schedule> {
  const screenId = await readScreenId(config);

  if (!screenId) {
    throw new Error("screenId is required for schedule sync; keeping existing local schedule");
  }

  const scheduleUrl = `${config.serverUrl}/api/schedule?screenId=${encodeURIComponent(screenId)}`;
  const response = await fetch(scheduleUrl);

  if (!response.ok) {
    throw new Error(`schedule request failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  if (!isSchedule(body)) {
    throw new Error("schedule response did not match expected shape");
  }

  return body;
}

async function readScreenId(config: AgentConfig): Promise<string | null> {
  if (config.screenId) {
    return config.screenId;
  }

  try {
    const content = await readFile(config.registrationPath, "utf8");
    const value = JSON.parse(content) as { screenId?: unknown };

    if (typeof value.screenId === "string" && value.screenId.trim()) {
      return value.screenId.trim();
    }
  } catch {
    return null;
  }

  return null;
}

async function saveSchedule(config: AgentConfig, schedule: Schedule) {
  await mkdir(dirname(config.schedulePath), { recursive: true });
  await writeFile(config.schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
}

async function syncMediaFile(config: AgentConfig, file: string) {
  const safeFile = basename(file);

  if (safeFile !== file) {
    console.error("media failed", { file, error: "invalid media filename" });
    return;
  }

  const localPath = resolve(config.mediaDir, safeFile);

  try {
    await access(localPath);
    console.log("media already present", { file: safeFile, localPath });
    return;
  } catch {
    // Missing locally; download from server below.
  }

  try {
    const response = await fetch(`${config.serverUrl}/media/${encodeURIComponent(safeFile)}`);

    if (!response.ok) {
      throw new Error(`media request failed with HTTP ${response.status}`);
    }

    const content = Buffer.from(await response.arrayBuffer());
    await mkdir(config.mediaDir, { recursive: true });
    await writeFile(localPath, content);
    console.log("media downloaded", { file: safeFile, localPath });
  } catch (error) {
    console.error("media failed: keeping existing local file if present", {
      file: safeFile,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function syncMediaFiles(config: AgentConfig, schedule: Schedule) {
  const files = new Set<string>();

  for (const item of schedule.items) {
    if (item.type === "image" || item.type === "video") {
      files.add(item.file);
    }
  }

  for (const region of schedule.theme?.regions ?? []) {
    if ((region.type === "logo" || region.type === "image") && region.file) {
      files.add(region.file);
    }
  }

  for (const file of files) {
    await syncMediaFile(config, file);
  }
}

async function readLocalScheduleVersion(config: AgentConfig): Promise<number | null> {
  try {
    const content = await readFile(config.schedulePath, "utf8");
    const body: unknown = JSON.parse(content);

    if (isSchedule(body)) {
      return body.version;
    }
  } catch {
    return null;
  }

  return null;
}

async function countCachedFiles(config: AgentConfig): Promise<number> {
  try {
    const filenames = await readdir(config.mediaDir);
    const stats = await Promise.all(
      filenames
        .filter((filename) => !filename.startsWith("."))
        .map(async (filename) => stat(resolve(config.mediaDir, filename)))
    );

    return stats.filter((fileStat) => fileStat.isFile()).length;
  } catch {
    return 0;
  }
}

async function writeAgentStatus(config: AgentConfig, currentScheduleVersion: number | null) {
  await writeAgentStatusFile(config, {
    lastSync: new Date().toISOString(),
    currentScheduleVersion,
    cachedFiles: await countCachedFiles(config)
  });
}

async function readExistingAgentStatus(config: AgentConfig): Promise<{
  lastSync: string | null;
}> {
  try {
    const content = await readFile(config.statusPath, "utf8");
    const value = JSON.parse(content) as { lastSync?: unknown };

    return {
      lastSync: typeof value.lastSync === "string" ? value.lastSync : null
    };
  } catch {
    return {
      lastSync: null
    };
  }
}

async function writeAgentFailureStatus(
  config: AgentConfig,
  currentScheduleVersion: number | null
) {
  const existingStatus = await readExistingAgentStatus(config);
  await writeAgentStatusFile(config, {
    lastSync: existingStatus.lastSync,
    currentScheduleVersion,
    cachedFiles: await countCachedFiles(config)
  });
}

async function writeAgentStatusFile(
  config: AgentConfig,
  status: {
    lastSync: string | null;
    currentScheduleVersion: number | null;
    cachedFiles: number;
  }
) {
  await mkdir(dirname(config.statusPath), { recursive: true });
  await writeFile(
    config.statusPath,
    `${JSON.stringify(status, null, 2)}\n`,
    "utf8"
  );
}

export function startSyncLoop(config: AgentConfig) {
  console.log("sync loop ready", {
    cacheDir: config.cacheDir,
    mediaDir: config.mediaDir,
    schedulePath: config.schedulePath,
    registrationPath: config.registrationPath,
    statusPath: config.statusPath,
    serverUrl: config.serverUrl,
    intervalMs: config.syncIntervalMs
  });

  const syncOnce = async () => {
    try {
      const schedule = await fetchSchedule(config);
      await syncMediaFiles(config, schedule);
      await saveSchedule(config, schedule);
      await writeAgentStatus(config, schedule.version);
      console.log("sync success", {
        scheduleVersion: schedule.version,
        schedulePath: config.schedulePath
      });
    } catch (error) {
      const currentScheduleVersion = await readLocalScheduleVersion(config);
      await writeAgentFailureStatus(config, currentScheduleVersion);
      console.error("sync failure: keeping existing local schedule", {
        error: error instanceof Error ? error.message : String(error),
        currentScheduleVersion,
        schedulePath: config.schedulePath
      });
    }
  };

  void syncOnce();
  setInterval(() => {
    void syncOnce();
  }, config.syncIntervalMs);
}
