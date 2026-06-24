import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
  const response = await fetch(`${config.serverUrl}/api/schedule`);

  if (!response.ok) {
    throw new Error(`schedule request failed with HTTP ${response.status}`);
  }

  const body: unknown = await response.json();

  if (!isSchedule(body)) {
    throw new Error("schedule response did not match expected shape");
  }

  return body;
}

async function saveSchedule(config: AgentConfig, schedule: Schedule) {
  await mkdir(dirname(config.schedulePath), { recursive: true });
  await writeFile(config.schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
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

export function startSyncLoop(config: AgentConfig) {
  console.log("sync loop ready", {
    cacheDir: config.cacheDir,
    schedulePath: config.schedulePath,
    serverUrl: config.serverUrl,
    intervalMs: config.syncIntervalMs
  });

  const syncOnce = async () => {
    try {
      const schedule = await fetchSchedule(config);
      await saveSchedule(config, schedule);
      console.log("sync success", {
        scheduleVersion: schedule.version,
        schedulePath: config.schedulePath
      });
    } catch (error) {
      const currentScheduleVersion = await readLocalScheduleVersion(config);
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
