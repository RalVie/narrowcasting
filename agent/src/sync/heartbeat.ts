import type { AgentConfig } from "../config/loadAgentConfig.js";

export function startHeartbeat(config: AgentConfig) {
  console.log("heartbeat placeholder ready", {
    deviceId: config.deviceId,
    intervalMs: config.heartbeatIntervalMs
  });

  setInterval(() => {
    console.log("heartbeat placeholder", {
      deviceId: config.deviceId,
      status: "local-playback-capable"
    });
  }, config.heartbeatIntervalMs);
}
