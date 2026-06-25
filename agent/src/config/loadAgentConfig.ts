export interface AgentConfig {
  deviceId: string;
  cacheDir: string;
  mediaDir: string;
  serverUrl: string;
  schedulePath: string;
  registrationPath: string;
  screenId: string | null;
  statusPath: string;
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
}

export function loadAgentConfig(): AgentConfig {
  const cacheDir = process.env.CACHE_DIR ?? "../player/public/data";

  return {
    deviceId: process.env.DEVICE_ID ?? "local-player",
    cacheDir,
    mediaDir: process.env.MEDIA_DIR ?? "../player/public/media",
    serverUrl: process.env.SERVER_URL ?? "http://localhost:3000",
    schedulePath: `${cacheDir}/schedule.json`,
    registrationPath: process.env.REGISTRATION_PATH ?? `${cacheDir}/player-registration.json`,
    screenId: process.env.SCREEN_ID ?? null,
    statusPath: process.env.STATUS_PATH ?? "../server/data/agent-status.json",
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 30_000),
    heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15_000)
  };
}
