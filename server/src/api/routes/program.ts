import type { FastifyPluginAsync } from "fastify";
import { createProgram, deleteProgram, getProgramsOrDefault, saveProgram } from "../../program/programStore.js";
import { badRequestForError, conflict, notFound } from "../apiErrors.js";
import { validateProgramDelete } from "../../validation/referenceIntegrity.js";

export const programRoutes: FastifyPluginAsync = async (app) => {
  app.get("/programs", async () => getProgramsOrDefault());

  app.post("/programs", async (request, reply) => {
    try {
      const program = await createProgram(request.body);
      return reply.code(201).send(program);
    } catch (error) {
      return badRequestForError(reply, error, "program could not be created");
    }
  });

  app.put<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    let program;

    try {
      program = await saveProgram(request.params.id, request.body);
    } catch (error) {
      return badRequestForError(reply, error, "program could not be updated");
    }

    if (!program) {
      return notFound(reply, "program not found", "PROGRAM_NOT_FOUND");
    }

    return reply.send(program);
  });

  app.delete<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    const validation = await validateProgramDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const deleted = await deleteProgram(request.params.id);

    if (!deleted) {
      return notFound(reply, "program not found", "PROGRAM_NOT_FOUND");
    }

    return reply.code(204).send();
  });
};
