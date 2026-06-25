import type { FastifyPluginAsync } from "fastify";
import { getProgramsOrDefault } from "../../program/programStore.js";
import {
  approveScreen,
  assignProgramToScreen,
  getScreenById,
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

  app.get<{ Params: { id: string } }>("/screens/:id/assignment", async (request, reply) => {
    const screen = await getScreenById(request.params.id);

    if (!screen) {
      return reply.code(404).send({ error: "screen not found" });
    }

    return reply.send({
      screenId: screen.screenId,
      assignedProgramId: screen.assignedProgramId ?? null,
      assignedProgramName: screen.assignedProgramName ?? null,
      lastAssignment: screen.lastAssignment ?? null
    });
  });

  app.post<{ Params: { id: string } }>("/screens/:id/assign-program", async (request, reply) => {
    const body = request.body as { programId?: unknown } | undefined;
    const programId = typeof body?.programId === "string" && body.programId.trim() ? body.programId.trim() : null;
    const programs = await getProgramsOrDefault();
    const program = programId ? programs.find((item) => item.id === programId) : null;

    if (programId && !program) {
      return reply.code(400).send({ error: "program not found" });
    }

    const screen = await assignProgramToScreen(
      request.params.id,
      program?.id ?? null,
      program?.name ?? null
    );

    if (!screen) {
      return reply.code(404).send({ error: "screen not found" });
    }

    return reply.send(screen);
  });
};
