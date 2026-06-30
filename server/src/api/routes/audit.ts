import type { FastifyPluginAsync } from "fastify";
import { listAuditEvents } from "../../audit/auditStore.js";

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { limit?: string } }>("/audit", async (request) => {
    const limit = Number(request.query.limit ?? 100);

    return {
      events: await listAuditEvents(Number.isFinite(limit) ? limit : 100)
    };
  });
};

