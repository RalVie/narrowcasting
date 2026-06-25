import type { FastifyPluginAsync } from "fastify";
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment
} from "../../assignments/assignmentStore.js";

export const assignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/assignments", async () => listAssignments());

  app.post("/assignments", async (request, reply) => {
    try {
      const assignment = await createAssignment(request.body ?? {});
      return reply.code(201).send(assignment);
    } catch (error) {
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
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "assignment could not be updated"
      });
    }
  });

  app.post<{ Params: { id: string } }>("/assignments/:id/delete", async (request, reply) => {
    const deleted = await deleteAssignment(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "assignment not found" });
    }

    return reply.send({ ok: true });
  });
};
