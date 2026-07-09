import { readFile } from "node:fs/promises";
import { hostname, networkInterfaces } from "node:os";
import {
  type BrowserRendererRuntimeStatus,
  normalizeBrowserRendererStatus
} from "../browserRenderer/browserRendererStatus.js";
import type { AgentConfig } from "../config/loadAgentConfig.js";
import type { Schedule } from "../schedule/types.js";

interface DeviceRegistration {
  screenId: string | null;
  playerId: string;
  deviceSecret: string | null;
}

interface AgentStatusSnapshot {
  lastSync: string | null;
  syncStatus: string | null;
  lastError: string | null;
  browserRenderer: BrowserRendererRuntimeStatus | null;
}

function sanitizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readDeviceRegistration(config: AgentConfig): Promise<DeviceRegistration> {
  let screenId = config.screenId;
  let deviceSecret = config.deviceSecret;
  let playerId = config.deviceId;

  try {
    const content = await readFile(config.registrationPath, "utf8");
    const body = JSON.parse(content) as {
      screenId?: unknown;
      playerId?: unknown;
      deviceSecret?: unknown;
    };

    screenId = screenId ?? sanitizeText(body.screenId);
    deviceSecret = deviceSecret ?? sanitizeText(body.deviceSecret);
    playerId = sanitizeText(body.playerId) ?? playerId;
  } catch {
    // Missing registration is a normal state before approval or after decommission.
  }

  return {
    screenId,
    playerId,
    deviceSecret
  };
}

async function readSchedule(config: AgentConfig): Promise<Schedule | null> {
  try {
    const content = await readFile(config.schedulePath, "utf8");
    const body = JSON.parse(content) as Schedule;

    if (typeof body.version === "number" && Array.isArray(body.items)) {
      return body;
    }
  } catch {
    // Schedule may not exist before the first successful sync.
  }

  return null;
}

async function readAgentStatus(config: AgentConfig): Promise<AgentStatusSnapshot> {
  try {
    const content = await readFile(config.statusPath, "utf8");
    const body = JSON.parse(content) as {
      browserRenderer?: unknown;
      lastSync?: unknown;
      syncStatus?: unknown;
      lastError?: unknown;
    };

    return {
      lastSync: sanitizeText(body.lastSync),
      syncStatus: sanitizeText(body.syncStatus),
      lastError: sanitizeText(body.lastError),
      browserRenderer: body.browserRenderer ? normalizeBrowserRendererStatus(body.browserRenderer) : null
    };
  } catch {
    return {
      lastSync: null,
      syncStatus: null,
      lastError: null,
      browserRenderer: null
    };
  }
}

function getPrimaryNetworkIp() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return null;
}

function getOrientation(schedule: Schedule | null): "landscape" | "portrait" | "unknown" {
  return schedule?.theme?.orientation ?? "unknown";
}

function getResolution(schedule: Schedule | null) {
  if (!schedule?.theme?.canvasWidth || !schedule.theme.canvasHeight) {
    return null;
  }

  return `${schedule.theme.canvasWidth}x${schedule.theme.canvasHeight}`;
}

export function startHeartbeat(config: AgentConfig) {
  console.log("heartbeat loop ready", {
    deviceId: config.deviceId,
    registrationPath: config.registrationPath,
    serverUrl: config.serverUrl,
    intervalMs: config.heartbeatIntervalMs
  });

  let lastSkipReason: string | null = null;

  const heartbeatOnce = async () => {
    const registration = await readDeviceRegistration(config);

    if (!registration.screenId || !registration.deviceSecret) {
      const reason = !registration.screenId ? "missing screenId" : "missing deviceSecret";

      if (lastSkipReason !== reason) {
        console.warn("heartbeat skipped", {
          reason,
          registrationPath: config.registrationPath
        });
        lastSkipReason = reason;
      }

      return;
    }

    lastSkipReason = null;

    const schedule = await readSchedule(config);
    const agentStatus = await readAgentStatus(config);
    const now = new Date().toISOString();
    const heartbeatUrl = `${config.serverUrl}/api/screens/${encodeURIComponent(registration.screenId)}/heartbeat`;
    const payload = {
      screenId: registration.screenId,
      playerId: registration.playerId,
      hostname: hostname() || null,
      softwareVersion: "agent",
      uptime: Math.round(process.uptime()),
      currentTime: now,
      lastSeen: now,
      currentProgram: schedule?.assignedProgramName ?? null,
      currentPlaylist: null,
      currentMedia: null,
      currentMediaType: null,
      playState:
        schedule?.assignmentStatus === "decommissioned"
          ? "decommissioned"
          : schedule && schedule.items.length === 0
            ? "empty"
            : schedule
              ? "ready"
              : "waiting",
      cpuUsage: null,
      memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024),
      diskFree: null,
      networkIp: getPrimaryNetworkIp(),
      resolution: getResolution(schedule),
      orientation: getOrientation(schedule),
      syncStatus: agentStatus.syncStatus,
      lastScheduleSync: agentStatus.lastSync,
      lastScheduleSignature: schedule ? String(schedule.version) : null,
      playbackError: agentStatus.lastError,
      browserRenderer: agentStatus.browserRenderer
    };

    try {
      const response = await fetch(heartbeatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Narrowcasting-Device-Secret": registration.deviceSecret
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
        console.error("heartbeat failed", {
          screenId: registration.screenId,
          status: response.status,
          code: body?.code ?? null,
          message: body?.message ?? null
        });
        return;
      }

      console.log("heartbeat sent", {
        screenId: registration.screenId,
        syncStatus: payload.syncStatus,
        lastScheduleSignature: payload.lastScheduleSignature
      });
    } catch (error) {
      console.error("heartbeat failed", {
        screenId: registration.screenId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  void heartbeatOnce();
  setInterval(() => {
    void heartbeatOnce();
  }, config.heartbeatIntervalMs);
}
