import type { FastifyPluginAsync } from "fastify";
import {
  getGeneratedSchedule,
  getGeneratedScheduleForScreen
} from "../../scheduler/generatedSchedule.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { screenId?: string } }>("/schedule", async (request) => {
    if (request.query.screenId) {
      return getGeneratedScheduleForScreen(request.query.screenId);
    }

    return getGeneratedSchedule();
  });
};
