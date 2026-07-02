export interface AgentConfig {
  deviceId: string;
  cacheDir: string;
  mediaDir: string;
  serverUrl: string;
  schedulePath: string;
  registrationPath: string;
  screenId: string | null;
  deviceSecret: string | null;
  statusPath: string;
  syncIntervalMs: number;
  heartbeatIntervalMs: number;
  browserRendererEnabled: boolean;
  browserRendererControlHost: string;
  browserRendererControlPort: number;
  browserRendererTimeoutMs: number;
  chromiumCdpHost: string;
  chromiumCdpPort: number;
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
    deviceSecret: process.env.DEVICE_SECRET ?? null,
    statusPath: process.env.STATUS_PATH ?? "../server/data/agent-status.json",
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 30_000),
    heartbeatIntervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15_000),
    browserRendererEnabled: process.env.BROWSER_RENDERER_ENABLED !== "0",
    browserRendererControlHost: process.env.BROWSER_RENDERER_CONTROL_HOST ?? "127.0.0.1",
    browserRendererControlPort: Number(process.env.BROWSER_RENDERER_CONTROL_PORT ?? 4175),
    browserRendererTimeoutMs: Number(process.env.BROWSER_RENDERER_TIMEOUT_MS ?? 15_000),
    chromiumCdpHost: process.env.CHROMIUM_CDP_HOST ?? "127.0.0.1",
    chromiumCdpPort: Number(process.env.CHROMIUM_CDP_PORT ?? 9222)
  };
}
