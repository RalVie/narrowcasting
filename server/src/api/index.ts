import type { FastifyPluginAsync } from "fastify";

export const registerApi: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    service: "narrowcasting-api",
    status: "ready"
  }));
};
