export interface AgentConfig {
  deviceId: string;
  cacheDir: string;
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
}

export function loadAgentConfig(): AgentConfig {
  return {
    deviceId: process.env.DEVICE_ID ?? "local-player",
    cacheDir: process.env.CACHE_DIR ?? "./cache",
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 30_000),
    heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15_000)
  };
}
