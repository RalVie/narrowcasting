import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApi } from "./api/index.js";
import { badRequest, internalError, payloadTooLarge } from "./api/apiErrors.js";
import { healthRoutes } from "./api/routes/health.js";
import { registerAuditHooks } from "./audit/auditHooks.js";
import { mediaRoutes } from "./api/routes/media.js";
import { registerDashboardStatic } from "./dashboard/dashboardStatic.js";
import { createDatabaseContext } from "./db/context.js";
import { registerAdminAuth } from "./security/adminAuth.js";

function getAllowedCorsOrigins() {
  return (process.env.NARROWCASTING_CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

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
  const allowedCorsOrigins = getAllowedCorsOrigins();

  app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedCorsOrigins.length > 0) {
        callback(null, allowedCorsOrigins.includes(origin));
        return;
      }

      // Development keeps broad CORS so Vite dashboard dev servers can call the Pi/server.
      // Production without NARROWCASTING_CORS_ORIGIN only allows same-origin/no-Origin requests.
      callback(null, process.env.NODE_ENV !== "production");
    },
    allowedHeaders: ["Content-Type", "Authorization", "X-Narrowcasting-Admin-Key"],
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  registerAdminAuth(app);
  registerAuditHooks(app);
  app.register(healthRoutes);
  app.register(mediaRoutes);
  app.register(registerApi, { prefix: "/api" });
  registerDashboardStatic(app);

  return app;
}
