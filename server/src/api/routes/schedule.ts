import type { FastifyPluginAsync } from "fastify";
import { getScheduleFromPlaylist } from "../../playlist/playlistStore.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/schedule", async () => getScheduleFromPlaylist());
};
