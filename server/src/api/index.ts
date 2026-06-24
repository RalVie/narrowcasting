import type { FastifyPluginAsync } from "fastify";
import { playlistRoutes } from "./routes/playlist.js";
import { scheduleRoutes } from "./routes/schedule.js";
import { statusRoutes } from "./routes/status.js";

export const registerApi: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    service: "narrowcasting-api",
    status: "ready"
  }));

  app.register(playlistRoutes);
  app.register(scheduleRoutes);
  app.register(statusRoutes);
};
