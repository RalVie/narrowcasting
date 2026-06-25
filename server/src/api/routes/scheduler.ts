import type { FastifyPluginAsync } from "fastify";
import { explainSchedulerResolution } from "../../scheduler/schedulerResolver.js";
import { readScheduler, saveScheduler } from "../../scheduler/schedulerStore.js";

export const schedulerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/scheduler", async () => readScheduler());

  app.get<{ Querystring: { screenId?: string } }>("/scheduler/resolve", async (request, reply) => {
    if (!request.query.screenId) {
      return reply.code(400).send({ error: "screenId is required" });
    }

    return explainSchedulerResolution(request.query.screenId);
  });

  app.put("/scheduler", async (request, reply) => {
    const scheduler = await saveScheduler(request.body);
    return reply.send(scheduler);
  });
};
