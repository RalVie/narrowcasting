import type { FastifyPluginAsync } from "fastify";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistOrDefault,
  listPlaylists,
  savePlaylist,
  savePlaylistRecord
} from "../../playlist/playlistStore.js";

export const playlistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/playlist", async () => getPlaylistOrDefault());

  app.put("/playlist", async (request, reply) => {
    const playlist = await savePlaylist(request.body);
    return reply.send(playlist);
  });

  app.get("/playlists", async () => listPlaylists());

  app.post("/playlists", async (request, reply) => {
    const playlist = await createPlaylist(request.body);
    return reply.code(201).send(playlist);
  });

  app.put<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const playlist = await savePlaylistRecord(request.params.id, request.body);

    if (!playlist) {
      return reply.code(404).send({ error: "playlist not found" });
    }

    return reply.send(playlist);
  });

  app.delete<{ Params: { id: string } }>("/playlists/:id", async (request, reply) => {
    const deleted = await deletePlaylist(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "playlist not found or cannot be deleted" });
    }

    return reply.code(204).send();
  });
};
