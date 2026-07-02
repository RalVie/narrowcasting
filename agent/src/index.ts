import { loadAgentConfig } from "./config/loadAgentConfig.js";
import { startBrowserRendererControlServer } from "./browserRenderer/controlServer.js";
import { startHeartbeat } from "./sync/heartbeat.js";
import { startSyncLoop } from "./sync/syncLoop.js";

const config = loadAgentConfig();

console.log("narrowcasting agent starting", {
  deviceId: config.deviceId,
  cacheDir: config.cacheDir,
  mediaDir: config.mediaDir,
  schedulePath: config.schedulePath,
  statusPath: config.statusPath,
  serverUrl: config.serverUrl,
  browserRendererControl: config.browserRendererEnabled
    ? `${config.browserRendererControlHost}:${config.browserRendererControlPort}`
    : "disabled"
});

startBrowserRendererControlServer(config);
startHeartbeat(config);
startSyncLoop(config);
