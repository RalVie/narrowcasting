import type { FastifyPluginAsync } from "fastify";
import { createTheme, deleteTheme, listThemes, saveTheme } from "../../theme/themeStore.js";
import { validateThemeDelete } from "../../validation/referenceIntegrity.js";

export const themeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/themes", async () => listThemes());

  app.post("/themes", async (request, reply) => {
    const theme = await createTheme(request.body);
    return reply.code(201).send(theme);
  });

  app.put<{ Params: { id: string } }>("/themes/:id", async (request, reply) => {
    const theme = await saveTheme(request.params.id, request.body);

    if (!theme) {
      return reply.code(404).send({ error: "theme not found" });
    }

    return reply.send(theme);
  });

  app.delete<{ Params: { id: string } }>("/themes/:id", async (request, reply) => {
    const validation = await validateThemeDelete(request.params.id);

    if (!validation.ok) {
      return reply.code(409).send(validation.error);
    }

    const deleted = await deleteTheme(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "theme not found or cannot be deleted" });
    }

    return reply.code(204).send();
  });
};
