import { loadAgentConfig } from "./config/loadAgentConfig.js";
import { startHeartbeat } from "./sync/heartbeat.js";
import { startSyncLoop } from "./sync/syncLoop.js";

const config = loadAgentConfig();

console.log("narrowcasting agent starting", {
  deviceId: config.deviceId,
  cacheDir: config.cacheDir
});

startHeartbeat(config);
startSyncLoop(config);
