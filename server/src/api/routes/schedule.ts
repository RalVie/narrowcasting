import type { FastifyPluginAsync } from "fastify";
import { getGeneratedScheduleForScreen } from "../../scheduler/generatedSchedule.js";
import { badRequest } from "../apiErrors.js";
import { authenticateScreenDevice } from "../../security/deviceAuth.js";
import { authenticateAdminRequest, hasAdminAuthorization } from "../../security/adminAuth.js";

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { screenId?: string } }>("/schedule", async (request, reply) => {
    const screenId = request.query.screenId?.trim();

    if (!screenId) {
      return badRequest(reply, "screenId is required for resolved schedule retrieval", "SCREEN_ID_REQUIRED");
    }

    if (hasAdminAuthorization(request)) {
      if (!authenticateAdminRequest(request, reply)) {
        return reply;
      }

      return getGeneratedScheduleForScreen(screenId);
    }

    const screen = await authenticateScreenDevice(request, reply, screenId);

    if (!screen) {
      return reply;
    }

    return getGeneratedScheduleForScreen(screenId);
  });
};
