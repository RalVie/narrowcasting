import type { FastifyPluginAsync } from "fastify";
import {
  AssignmentOwnershipError,
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment
} from "../../assignments/assignmentStore.js";
import { DomainValidationError, validationErrorResponse } from "../../validation/domainValidation.js";
import { validateAssignmentDelete } from "../../validation/referenceIntegrity.js";

function assignmentOwnershipError(error: AssignmentOwnershipError) {
  return {
    error: "validation_error",
    code: error.code,
    message: error.message,
    objectType: "Assignment",
    objectId: error.assignment.id,
    owner: {
      sourceType: error.assignment.sourceType,
      sourceId: error.assignment.sourceId ?? null,
      sourceName: error.assignment.sourceName ?? null
    }
  };
}

export const assignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/assignments", async () => listAssignments());

  app.post("/assignments", async (request, reply) => {
    try {
      const assignment = await createAssignment(request.body ?? {});
      return reply.code(201).send(assignment);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      return reply.code(400).send({
        error: error instanceof Error ? error.message : "assignment could not be created"
      });
    }
  });

  app.post<{ Params: { id: string } }>("/assignments/:id/update", async (request, reply) => {
    try {
      const assignment = await updateAssignment(request.params.id, request.body ?? {});

      if (!assignment) {
        return reply.code(404).send({ error: "assignment not found" });
      }

      return reply.send(assignment);
    } catch (error) {
      if (error instanceof AssignmentOwnershipError) {
        return reply.code(409).send(assignmentOwnershipError(error));
      }

      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      return reply.code(400).send({
        error: error instanceof Error ? error.message : "assignment could not be updated"
      });
    }
  });

  app.post<{ Params: { id: string } }>("/assignments/:id/delete", async (request, reply) => {
    const validation = await validateAssignmentDelete(request.params.id);

    if (!validation.ok) {
      return reply.code(409).send(validation.error);
    }

    let deleted: boolean;

    try {
      deleted = await deleteAssignment(request.params.id);
    } catch (error) {
      if (error instanceof AssignmentOwnershipError) {
        return reply.code(409).send(assignmentOwnershipError(error));
      }

      throw error;
    }

    if (!deleted) {
      return reply.code(404).send({ error: "assignment not found" });
    }

    return reply.send({ ok: true });
  });
};
