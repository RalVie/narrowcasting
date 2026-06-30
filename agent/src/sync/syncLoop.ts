import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
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
  const deviceIdentity = await readDeviceIdentity(config);

  if (!deviceIdentity.screenId) {
    throw new Error("screenId is required for schedule sync; keeping existing local schedule");
  }

  if (!deviceIdentity.deviceSecret) {
    throw new Error("deviceSecret is required for authenticated schedule sync; keeping existing local schedule");
  }

  const scheduleUrl = `${config.serverUrl}/api/schedule?screenId=${encodeURIComponent(deviceIdentity.screenId)}`;
  const response = await fetch(scheduleUrl, {
    headers: {
      "X-Narrowcasting-Device-Secret": deviceIdentity.deviceSecret
    }
  });

  if (!response.ok) {
    throw new Error(`schedule request failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  if (!isSchedule(body)) {
    throw new Error("schedule response did not match expected shape");
  }

  return body;
}

async function readDeviceIdentity(config: AgentConfig): Promise<{
  screenId: string | null;
  deviceSecret: string | null;
}> {
  let screenId = config.screenId;
  let deviceSecret = config.deviceSecret;

  if (config.screenId) {
    screenId = config.screenId;
  }

  try {
    const content = await readFile(config.registrationPath, "utf8");
    const value = JSON.parse(content) as { screenId?: unknown; deviceSecret?: unknown };

    if (!screenId && typeof value.screenId === "string" && value.screenId.trim()) {
      screenId = value.screenId.trim();
    }

    if (!deviceSecret && typeof value.deviceSecret === "string" && value.deviceSecret.trim()) {
      deviceSecret = value.deviceSecret.trim();
    }
  } catch {
    return {
      screenId,
      deviceSecret
    };
  }

  return {
    screenId,
    deviceSecret
  };
}

async function saveSchedule(config: AgentConfig, schedule: Schedule) {
  await mkdir(dirname(config.schedulePath), { recursive: true });
  const pendingPath = `${config.schedulePath}.tmp`;

  await writeFile(pendingPath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
  await rename(pendingPath, config.schedulePath);
}

interface MediaSyncResult {
  file: string;
  localPath?: string;
  ready: boolean;
  status: "already_present" | "downloaded" | "failed";
  size?: number;
  expectedSize?: number | null;
  error?: string;
}

async function verifyCachedMediaFile(localPath: string, expectedSize?: number | null) {
  try {
    const fileStat = await stat(localPath);

    if (!fileStat.isFile()) {
      return { ready: false, size: fileStat.size, error: "cached path is not a file" };
    }

    if (expectedSize !== undefined && expectedSize !== null && fileStat.size !== expectedSize) {
      return {
        ready: false,
        size: fileStat.size,
        error: `cached file size ${fileStat.size} did not match expected size ${expectedSize}`
      };
    }

    return { ready: true, size: fileStat.size };
  } catch (error) {
    return {
      ready: false,
      size: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function readContentLength(response: Response) {
  const header = response.headers.get("content-length");

  if (!header) {
    return null;
  }

  const size = Number(header);

  return Number.isFinite(size) && size >= 0 ? size : null;
}

async function syncMediaFile(config: AgentConfig, file: string): Promise<MediaSyncResult> {
  const safeFile = basename(file);

  if (safeFile !== file) {
    console.error("media failed", { file, error: "invalid media filename" });
    return {
      file,
      ready: false,
      status: "failed",
      error: "invalid media filename"
    };
  }

  const localPath = resolve(config.mediaDir, safeFile);

  try {
    await access(localPath);
    const verification = await verifyCachedMediaFile(localPath);

    if (verification.ready) {
      console.log("media already present", { file: safeFile, localPath });
      return {
        file: safeFile,
        localPath,
        ready: true,
        status: "already_present",
        size: verification.size
      };
    }

    console.error("media failed", {
      file: safeFile,
      localPath,
      error: verification.error ?? "cached media verification failed"
    });
    return {
      file: safeFile,
      localPath,
      ready: false,
      status: "failed",
      size: verification.size,
      error: verification.error ?? "cached media verification failed"
    };
  } catch {
    // Missing locally; download from server below.
  }

  try {
    const response = await fetch(`${config.serverUrl}/media/${encodeURIComponent(safeFile)}`);

    if (!response.ok) {
      throw new Error(`media request failed with HTTP ${response.status}`);
    }

    const expectedSize = readContentLength(response);
    const content = Buffer.from(await response.arrayBuffer());
    const pendingPath = `${localPath}.tmp`;

    if (expectedSize !== null && content.length !== expectedSize) {
      throw new Error(`downloaded size ${content.length} did not match expected size ${expectedSize}`);
    }

    await mkdir(config.mediaDir, { recursive: true });
    await writeFile(pendingPath, content);
    await rename(pendingPath, localPath);

    const verification = await verifyCachedMediaFile(localPath, expectedSize);

    if (!verification.ready) {
      throw new Error(verification.error ?? "downloaded media verification failed");
    }

    console.log("media downloaded", { file: safeFile, localPath });
    return {
      file: safeFile,
      localPath,
      ready: true,
      status: "downloaded",
      size: verification.size,
      expectedSize
    };
  } catch (error) {
    const existingVerification = await verifyCachedMediaFile(localPath);
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error("media failed: keeping existing local file if present", {
      file: safeFile,
      error: errorMessage
    });

    return {
      file: safeFile,
      localPath,
      ready: existingVerification.ready,
      status: existingVerification.ready ? "already_present" : "failed",
      size: existingVerification.size,
      error: existingVerification.ready ? undefined : errorMessage
    };
  }
}

function getRequiredMediaFiles(schedule: Schedule) {
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

  return Array.from(files);
}

async function syncMediaFiles(config: AgentConfig, schedule: Schedule) {
  const files = getRequiredMediaFiles(schedule);
  const results: MediaSyncResult[] = [];

  for (const file of files) {
    results.push(await syncMediaFile(config, file));
  }

  return {
    requiredFiles: files,
    results,
    ready: results.every((result) => result.ready),
    failed: results.filter((result) => !result.ready)
  };
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
    cachedFiles: await countCachedFiles(config),
    syncStatus: "ready",
    readinessState: "ready",
    pendingScheduleVersion: null,
    failedMedia: []
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
  currentScheduleVersion: number | null,
  details: {
    syncStatus?: string;
    readinessState?: string;
    pendingScheduleVersion?: number | null;
    failedMedia?: Array<{ file: string; error?: string }>;
    lastError?: string;
  } = {}
) {
  const existingStatus = await readExistingAgentStatus(config);
  await writeAgentStatusFile(config, {
    lastSync: existingStatus.lastSync,
    currentScheduleVersion,
    cachedFiles: await countCachedFiles(config),
    syncStatus: details.syncStatus ?? "error",
    readinessState: details.readinessState ?? "sync_failed",
    pendingScheduleVersion: details.pendingScheduleVersion ?? null,
    failedMedia: details.failedMedia ?? [],
    lastError: details.lastError
  });
}

async function writeAgentStatusFile(
  config: AgentConfig,
  status: {
    lastSync: string | null;
    currentScheduleVersion: number | null;
    cachedFiles: number;
    syncStatus?: string;
    readinessState?: string;
    pendingScheduleVersion?: number | null;
    failedMedia?: Array<{ file: string; error?: string }>;
    lastError?: string;
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
      await writeAgentFailureStatus(config, await readLocalScheduleVersion(config), {
        syncStatus: "waiting_for_media",
        readinessState: "schedule_pending_activation",
        pendingScheduleVersion: schedule.version
      });
      const mediaReadiness = await syncMediaFiles(config, schedule);

      if (!mediaReadiness.ready) {
        const currentScheduleVersion = await readLocalScheduleVersion(config);

        await writeAgentFailureStatus(config, currentScheduleVersion, {
          syncStatus: "media_download_failed",
          readinessState: "waiting_for_media",
          pendingScheduleVersion: schedule.version,
          failedMedia: mediaReadiness.failed.map((result) => ({
            file: result.file,
            error: result.error
          })),
          lastError: `required media not ready: ${mediaReadiness.failed
            .map((result) => result.file)
            .join(", ")}`
        });
        console.error("sync failure: keeping existing local schedule", {
          error: `required media not ready for schedule ${schedule.version}`,
          failedMedia: mediaReadiness.failed.map((result) => result.file),
          currentScheduleVersion,
          pendingScheduleVersion: schedule.version,
          schedulePath: config.schedulePath
        });
        return;
      }

      await saveSchedule(config, schedule);
      await writeAgentStatus(config, schedule.version);
      console.log("sync success", {
        scheduleVersion: schedule.version,
        requiredMedia: mediaReadiness.requiredFiles.length,
        schedulePath: config.schedulePath
      });
    } catch (error) {
      const currentScheduleVersion = await readLocalScheduleVersion(config);
      await writeAgentFailureStatus(config, currentScheduleVersion, {
        lastError: error instanceof Error ? error.message : String(error)
      });
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
