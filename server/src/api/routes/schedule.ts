import type { FastifyPluginAsync } from "fastify";
import { staticSchedule } from "../../schedule/staticSchedule.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/schedule", async () => staticSchedule);
};
