import type { FastifyPluginAsync } from "fastify";
import { scheduleRoutes } from "./routes/schedule.js";

export const registerApi: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    service: "narrowcasting-api",
    status: "ready"
  }));

  app.register(scheduleRoutes);
};
