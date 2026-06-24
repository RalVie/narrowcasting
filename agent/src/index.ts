import { loadAgentConfig } from "./config/loadAgentConfig.js";
import { startHeartbeat } from "./sync/heartbeat.js";
import { startSyncLoop } from "./sync/syncLoop.js";

const config = loadAgentConfig();

console.log("narrowcasting agent starting", {
  deviceId: config.deviceId,
  cacheDir: config.cacheDir,
  mediaDir: config.mediaDir,
  schedulePath: config.schedulePath,
  serverUrl: config.serverUrl
});

startHeartbeat(config);
startSyncLoop(config);
