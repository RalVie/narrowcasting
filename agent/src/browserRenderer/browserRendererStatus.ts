import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentConfig } from "../config/loadAgentConfig.js";

export type BrowserRendererStatusValue =
  | "idle"
  | "starting"
  | "active"
  | "returning"
  | "recovering"
  | "error";

export type BrowserRendererStopReason =
  | "schedule_changed"
  | "timed_playback_finished"
  | "watchdog_recovery"
  | "navigation_failed"
  | "manual_cancel"
  | "control_server_error";

export interface BrowserRendererRuntimeStatus {
  status: BrowserRendererStatusValue;
  currentUrl: string | null;
  playbackMode: "timed" | "persistent" | null;
  runningSince: string | null;
  lastUpdatedAt: string;
  lastStopReason: BrowserRendererStopReason | null;
  currentTitle?: string | null;
  navigationState?: "loading" | "loaded" | "failed" | null;
  error?: string | null;
}

export const idleBrowserRendererStatus: BrowserRendererRuntimeStatus = {
  status: "idle",
  currentUrl: null,
  playbackMode: null,
  runningSince: null,
  lastUpdatedAt: new Date(0).toISOString(),
  lastStopReason: null,
  currentTitle: null,
  navigationState: null,
  error: null
};

function isBrowserRendererStatus(value: unknown): value is BrowserRendererRuntimeStatus {
  return Boolean(value && typeof value === "object" && "status" in value);
}

export async function readBrowserRendererStatus(config: AgentConfig): Promise<BrowserRendererRuntimeStatus> {
  try {
    const content = await readFile(config.statusPath, "utf8");
    const value = JSON.parse(content) as { browserRenderer?: unknown };

    return normalizeBrowserRendererStatus(value.browserRenderer);
  } catch {
    return {
      ...idleBrowserRendererStatus,
      lastUpdatedAt: new Date().toISOString()
    };
  }
}

export function normalizeBrowserRendererStatus(value: unknown): BrowserRendererRuntimeStatus {
  if (!isBrowserRendererStatus(value)) {
    return {
      ...idleBrowserRendererStatus,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  const status = value.status;
  return {
    status:
      status === "starting" ||
      status === "active" ||
      status === "returning" ||
      status === "recovering" ||
      status === "error"
        ? status
        : "idle",
    currentUrl: typeof value.currentUrl === "string" && value.currentUrl.trim() ? value.currentUrl.trim() : null,
    playbackMode: value.playbackMode === "persistent" ? "persistent" : value.playbackMode === "timed" ? "timed" : null,
    runningSince: typeof value.runningSince === "string" ? value.runningSince : null,
    lastUpdatedAt: typeof value.lastUpdatedAt === "string" ? value.lastUpdatedAt : new Date().toISOString(),
    lastStopReason:
      value.lastStopReason === "schedule_changed" ||
      value.lastStopReason === "timed_playback_finished" ||
      value.lastStopReason === "watchdog_recovery" ||
      value.lastStopReason === "navigation_failed" ||
      value.lastStopReason === "manual_cancel" ||
      value.lastStopReason === "control_server_error"
        ? value.lastStopReason
        : null,
    currentTitle: typeof value.currentTitle === "string" ? value.currentTitle : null,
    navigationState:
      value.navigationState === "loading" || value.navigationState === "loaded" || value.navigationState === "failed"
        ? value.navigationState
        : null,
    error: typeof value.error === "string" ? value.error : null
  };
}

export async function writeBrowserRendererStatus(
  config: AgentConfig,
  status: BrowserRendererRuntimeStatus
): Promise<void> {
  let existing: Record<string, unknown> = {};

  try {
    existing = JSON.parse(await readFile(config.statusPath, "utf8")) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  await mkdir(dirname(config.statusPath), { recursive: true });
  await writeJsonAtomic(config.statusPath, {
    ...existing,
    browserRenderer: {
      ...status,
      lastUpdatedAt: status.lastUpdatedAt || new Date().toISOString()
    }
  });
}

async function writeJsonAtomic(path: string, value: unknown) {
  const pendingPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(pendingPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(pendingPath, path);
}
