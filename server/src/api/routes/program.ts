import type { FastifyPluginAsync } from "fastify";
import { createProgram, deleteProgram, getProgramsOrDefault, saveProgram } from "../../program/programStore.js";
import { DomainValidationError, validationErrorResponse } from "../../validation/domainValidation.js";
import { validateProgramDelete } from "../../validation/referenceIntegrity.js";

export const programRoutes: FastifyPluginAsync = async (app) => {
  app.get("/programs", async () => getProgramsOrDefault());

  app.post("/programs", async (request, reply) => {
    try {
      const program = await createProgram(request.body);
      return reply.code(201).send(program);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      throw error;
    }
  });

  app.put<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    let program;

    try {
      program = await saveProgram(request.params.id, request.body);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      throw error;
    }

    if (!program) {
      return reply.code(404).send({ error: "program not found" });
    }

    return reply.send(program);
  });

  app.delete<{ Params: { id: string } }>("/programs/:id", async (request, reply) => {
    const validation = await validateProgramDelete(request.params.id);

    if (!validation.ok) {
      return reply.code(409).send(validation.error);
    }

    const deleted = await deleteProgram(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "program not found" });
    }

    return reply.code(204).send();
  });
};
