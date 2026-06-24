import type { FastifyPluginAsync } from "fastify";
import { getPlaylistOrDefault, savePlaylist } from "../../playlist/playlistStore.js";

export const playlistRoutes: FastifyPluginAsync = async (app) => {
  app.get("/playlist", async () => getPlaylistOrDefault());

  app.put("/playlist", async (request, reply) => {
    const playlist = await savePlaylist(request.body);
    return reply.send(playlist);
  });
};
