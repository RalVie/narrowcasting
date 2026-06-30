import type { FastifyPluginAsync } from "fastify";
import {
  addScreenToGroup,
  createScreenGroup,
  deleteScreenGroup,
  listScreenGroups,
  removeScreenFromGroup,
  renameScreenGroup
} from "../../screens/screenGroupStore.js";
import { badRequest, notFound } from "../apiErrors.js";

export const screenGroupsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/screen-groups", async () => listScreenGroups());

  app.post("/screen-groups", async (request, reply) => {
    const group = await createScreenGroup(request.body ?? {});
    return reply.code(201).send(group);
  });

  app.post<{ Params: { groupId: string } }>("/screen-groups/:groupId/rename", async (request, reply) => {
    const group = await renameScreenGroup(request.params.groupId, request.body ?? {});

    if (!group) {
      return notFound(reply, "screen group not found", "SCREEN_GROUP_NOT_FOUND");
    }

    return reply.send(group);
  });

  app.post<{ Params: { groupId: string } }>("/screen-groups/:groupId/delete", async (request, reply) => {
    const deleted = await deleteScreenGroup(request.params.groupId);

    if (!deleted) {
      return notFound(reply, "screen group not found", "SCREEN_GROUP_NOT_FOUND");
    }

    return reply.send({ ok: true });
  });

  app.post<{ Params: { groupId: string } }>("/screen-groups/:groupId/screens/add", async (request, reply) => {
    try {
      const body = request.body as { screenId?: unknown } | undefined;
      const group = await addScreenToGroup(request.params.groupId, body?.screenId);

      if (!group) {
        return notFound(reply, "screen group not found", "SCREEN_GROUP_NOT_FOUND");
      }

      return reply.send(group);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : "screen could not be added");
    }
  });

  app.post<{ Params: { groupId: string } }>("/screen-groups/:groupId/screens/remove", async (request, reply) => {
    const body = request.body as { screenId?: unknown } | undefined;
    const group = await removeScreenFromGroup(request.params.groupId, body?.screenId);

    if (!group) {
      return notFound(reply, "screen group not found", "SCREEN_GROUP_NOT_FOUND");
    }

    return reply.send(group);
  });
};
