import type { FastifyPluginAsync } from "fastify";
import {
  approveScreen,
  listScreens,
  registerScreen,
  renameScreen,
  updateScreenHeartbeat
} from "../../screens/screenStore.js";

export const screensRoutes: FastifyPluginAsync = async (app) => {
  app.get("/screens", async () => listScreens());

  app.post("/screens/register", async (request, reply) => {
    try {
      const screen = await registerScreen(request.body ?? {});
      return reply.code(screen.status === "pending" ? 202 : 200).send(screen);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid screen registration"
      });
    }
  });

  app.post<{ Params: { id: string } }>("/screens/:id/approve", async (request, reply) => {
    const screen = await approveScreen(request.params.id);

    if (!screen) {
      return reply.code(404).send({ error: "screen not found" });
    }

    return reply.send(screen);
  });

  app.post<{ Params: { id: string } }>("/screens/:id/rename", async (request, reply) => {
    const body = request.body as { name?: unknown } | undefined;
    const screen = await renameScreen(request.params.id, body?.name);

    if (!screen) {
      return reply.code(404).send({ error: "screen not found" });
    }

    return reply.send(screen);
  });

  app.post<{ Params: { id: string } }>("/screens/:id/heartbeat", async (request, reply) => {
    const screen = await updateScreenHeartbeat(request.params.id, request.body ?? {});

    if (!screen) {
      return reply.code(404).send({ error: "screen not found or heartbeat rejected" });
    }

    return reply.send(screen);
  });
};
