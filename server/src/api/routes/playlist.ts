import type { FastifyPluginAsync } from "fastify";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistOrDefault,
  listPlaylists,
  savePlaylist,
  savePlaylistRecord
} from "../../playlist/playlistStore.js";
import { DomainValidationError, validationErrorResponse } from "../../validation/domainValidation.js";
import { validatePlaylistDelete } from "../../validation/referenceIntegrity.js";

export const playlistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/playlist", async () => getPlaylistOrDefault());

  app.put("/playlist", async (request, reply) => {
    try {
      const playlist = await savePlaylist(request.body);
      return reply.send(playlist);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      throw error;
    }
  });

  app.get("/playlists", async () => listPlaylists());

  app.post("/playlists", async (request, reply) => {
    try {
      const playlist = await createPlaylist(request.body);
      return reply.code(201).send(playlist);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      throw error;
    }
  });

  app.put<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    let playlist;

    try {
      playlist = await savePlaylistRecord(request.params.id, request.body);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        return reply.code(400).send(validationErrorResponse(error));
      }

      throw error;
    }

    if (!playlist) {
      return reply.code(404).send({ error: "playlist not found" });
    }

    return reply.send(playlist);
  });

  app.delete<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const validation = await validatePlaylistDelete(request.params.id);

    if (!validation.ok) {
      return reply.code(409).send(validation.error);
    }

    const deleted = await deletePlaylist(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "playlist not found or cannot be deleted" });
    }

    return reply.code(204).send();
  });
};
