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
  runtimeWatchdogEnabled: boolean;
  runtimeWatchdogIntervalMs: number;
  runtimeWatchdogStatusPath: string;
  runtimeWatchdogPlayerUrl: string;
  runtimeWatchdogMaxChromiumRestarts: number;
  runtimeWatchdogWindowMs: number;
  runtimeWatchdogAllowReboot: boolean;
  runtimeWatchdogRebootAfterFailures: number;
  narrowcastingPlayerService: string;
  narrowcastingAgentService: string;
  narrowcastingKioskService: string;
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
    chromiumCdpPort: Number(process.env.CHROMIUM_CDP_PORT ?? 9222),
    runtimeWatchdogEnabled: process.env.RUNTIME_WATCHDOG_ENABLED !== "0",
    runtimeWatchdogIntervalMs: Number(process.env.RUNTIME_WATCHDOG_INTERVAL_MS ?? 30_000),
    runtimeWatchdogStatusPath: process.env.RUNTIME_WATCHDOG_STATUS_PATH ?? `${cacheDir}/runtime-watchdog-status.json`,
    runtimeWatchdogPlayerUrl: process.env.RUNTIME_WATCHDOG_PLAYER_URL ?? "http://localhost:4174/player",
    runtimeWatchdogMaxChromiumRestarts: Number(process.env.RUNTIME_WATCHDOG_MAX_CHROMIUM_RESTARTS ?? 3),
    runtimeWatchdogWindowMs: Number(process.env.RUNTIME_WATCHDOG_WINDOW_MS ?? 300_000),
    runtimeWatchdogAllowReboot: process.env.RUNTIME_WATCHDOG_ALLOW_REBOOT === "1",
    runtimeWatchdogRebootAfterFailures: Number(process.env.RUNTIME_WATCHDOG_REBOOT_AFTER_FAILURES ?? 5),
    narrowcastingPlayerService: process.env.NARROWCASTING_PLAYER_SERVICE ?? "narrowcasting-player",
    narrowcastingAgentService: process.env.NARROWCASTING_AGENT_SERVICE ?? "narrowcasting-agent",
    narrowcastingKioskService: process.env.NARROWCASTING_KIOSK_SERVICE ?? "narrowcasting-kiosk"
  };
}
