import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApi } from "./api/index.js";
import { badRequest, internalError, payloadTooLarge } from "./api/apiErrors.js";
import { healthRoutes } from "./api/routes/health.js";
import { mediaRoutes } from "./api/routes/media.js";
import { registerDashboardStatic } from "./dashboard/dashboardStatic.js";
import { createDatabaseContext } from "./db/context.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  const db = createDatabaseContext();

  app.decorate("db", db);
  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;

    if (statusCode === 400) {
      request.log.warn({ error }, "bad api request");
      return badRequest(reply, error.message || "Bad request");
    }

    if (statusCode === 413) {
      request.log.warn({ error }, "api payload too large");
      return payloadTooLarge(reply, error.message || "Payload too large");
    }

    request.log.error({ error }, "unhandled api error");
    return internalError(reply);
  });
  app.register(cors, {
    origin: true
  });
  app.register(healthRoutes);
  app.register(mediaRoutes);
  app.register(registerApi, { prefix: "/api" });
  registerDashboardStatic(app);

  return app;
}
