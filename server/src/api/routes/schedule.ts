import type { FastifyPluginAsync } from "fastify";
import { getGeneratedScheduleForScreen } from "../../scheduler/generatedSchedule.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { screenId?: string } }>("/schedule", async (request, reply) => {
    const screenId = request.query.screenId?.trim();

    if (!screenId) {
      return reply.code(400).send({
        error: "screenId is required for resolved schedule retrieval"
      });
    }

    return getGeneratedScheduleForScreen(screenId);
  });
};
