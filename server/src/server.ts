import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerApi } from "./api/index.js";
import { healthRoutes } from "./api/routes/health.js";
import { mediaRoutes } from "./api/routes/media.js";
import { createDatabaseContext } from "./db/context.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  const db = createDatabaseContext();

  app.decorate("db", db);
  app.register(cors, {
    origin: true
  });
  app.register(healthRoutes);
  app.register(mediaRoutes);
  app.register(registerApi, { prefix: "/api" });

  return app;
}
