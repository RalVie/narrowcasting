import type { FastifyPluginAsync } from "fastify";
import { createProgram, deleteProgram, getProgramsOrDefault, saveProgram } from "../../program/programStore.js";

export const programRoutes: FastifyPluginAsync = async (app) => {
  app.get("/programs", async () => getProgramsOrDefault());

  app.post("/programs", async (request, reply) => {
    const program = await createProgram(request.body);
    return reply.code(201).send(program);
  });

  app.put<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    const program = await saveProgram(request.params.id, request.body);

    if (!program) {
      return reply.code(404).send({ error: "program not found" });
    }

    return reply.send(program);
  });

  app.delete<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    const deleted = await deleteProgram(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "program not found" });
    }

    return reply.code(204).send();
  });
};
