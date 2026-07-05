import { loadAgentConfig } from "./config/loadAgentConfig.js";
import { startBrowserRendererControlServer } from "./browserRenderer/controlServer.js";
import { startHeartbeat } from "./sync/heartbeat.js";
import { startSyncLoop } from "./sync/syncLoop.js";
import { startRuntimeWatchdog } from "./watchdog/runtimeWatchdog.js";

const config = loadAgentConfig();

console.log("narrowcasting agent starting", {
  deviceId: config.deviceId,
  cacheDir: config.cacheDir,
  mediaDir: config.mediaDir,
  schedulePath: config.schedulePath,
  statusPath: config.statusPath,
  serverUrl: config.serverUrl,
  runtimeWatchdog: config.runtimeWatchdogEnabled
    ? `${config.runtimeWatchdogIntervalMs}ms`
    : "disabled",
  browserRendererControl: config.browserRendererEnabled
    ? `${config.browserRendererControlHost}:${config.browserRendererControlPort}`
    : "disabled"
});

startBrowserRendererControlServer(config);
startRuntimeWatchdog(config);
startHeartbeat(config);
startSyncLoop(config);
