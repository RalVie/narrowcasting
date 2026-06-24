import type { AgentConfig } from "../config/loadAgentConfig.js";

export function startSyncLoop(config: AgentConfig) {
  console.log("sync loop placeholder ready", {
    cacheDir: config.cacheDir,
    intervalMs: config.syncIntervalMs
  });

  setInterval(() => {
    console.log("sync placeholder: no server sync configured yet");
  }, config.syncIntervalMs);
}
