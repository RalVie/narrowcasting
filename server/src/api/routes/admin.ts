import type { FastifyPluginAsync } from "fastify";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/admin/session", async () => ({
    authenticated: true,
    source: "server-admin-key"
  }));
};
