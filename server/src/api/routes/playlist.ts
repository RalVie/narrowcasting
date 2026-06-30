import type { FastifyPluginAsync } from "fastify";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistOrDefault,
  listPlaylists,
  savePlaylist,
  savePlaylistRecord
} from "../../playlist/playlistStore.js";
import { badRequestForError, conflict, notFound } from "../apiErrors.js";
import { validatePlaylistDelete } from "../../validation/referenceIntegrity.js";

export const playlistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/playlist", async () => getPlaylistOrDefault());

  app.put("/playlist", async (request, reply) => {
    try {
      const playlist = await savePlaylist(request.body);
      return reply.send(playlist);
    } catch (error) {
      return badRequestForError(reply, error, "playlist could not be saved");
    }
  });

  app.get("/playlists", async () => listPlaylists());

  app.post("/playlists", async (request, reply) => {
    try {
      const playlist = await createPlaylist(request.body);
      return reply.code(201).send(playlist);
    } catch (error) {
      return badRequestForError(reply, error, "playlist could not be created");
    }
  });

  app.put<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    let playlist;

    try {
      playlist = await savePlaylistRecord(request.params.id, request.body);
    } catch (error) {
      return badRequestForError(reply, error, "playlist could not be updated");
    }

    if (!playlist) {
      return notFound(reply, "playlist not found", "PLAYLIST_NOT_FOUND");
    }

    return reply.send(playlist);
  });

  app.delete<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const validation = await validatePlaylistDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const deleted = await deletePlaylist(request.params.id);

    if (!deleted) {
      return notFound(reply, "playlist not found or cannot be deleted", "PLAYLIST_NOT_FOUND");
    }

    return reply.code(204).send();
  });
};
