import type { FastifyPluginAsync } from "fastify";
import {
  getSystemStatus,
  listPlayerCachedMedia,
  readAgentStatus
} from "../../status/statusStore.js";

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status", async () => getSystemStatus());

  app.get("/player-cache", async () => {
    const files = await listPlayerCachedMedia();

    return {
      cachedFiles: files.length,
      files
    };
  });

  app.get("/agent-status", async () => readAgentStatus());
};
