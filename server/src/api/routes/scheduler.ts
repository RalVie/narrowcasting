import type { FastifyPluginAsync } from "fastify";
import { readScheduler, saveScheduler } from "../../scheduler/schedulerStore.js";

export const schedulerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/scheduler", async () => readScheduler());

  app.put("/scheduler", async (request, reply) => {
    const scheduler = await saveScheduler(request.body);
    return reply.send(scheduler);
  });
};
