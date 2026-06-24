import type { FastifyPluginAsync } from "fastify";
import { getGeneratedSchedule } from "../../scheduler/generatedSchedule.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/schedule", async () => getGeneratedSchedule());
};
