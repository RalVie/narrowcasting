import type { FastifyPluginAsync } from "fastify";
import { createTheme, deleteTheme, listThemes, saveTheme } from "../../theme/themeStore.js";
import { badRequestForError, conflict, notFound } from "../apiErrors.js";
import { validateThemeDelete } from "../../validation/referenceIntegrity.js";

export const themeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/themes", async () => listThemes());

  app.post("/themes", async (request, reply) => {
    try {
      const theme = await createTheme(request.body);
      return reply.code(201).send(theme);
    } catch (error) {
      return badRequestForError(reply, error, "theme could not be created");
    }
  });

  app.put<{ Params: { id: string } }>("/themes/:id", async (request, reply) => {
    let theme;

    try {
      theme = await saveTheme(request.params.id, request.body);
    } catch (error) {
      return badRequestForError(reply, error, "theme could not be updated");
    }

    if (!theme) {
      return notFound(reply, "theme not found", "THEME_NOT_FOUND");
    }

    return reply.send(theme);
  });

  app.delete<{ Params: { id: string } }>("/themes/:id", async (request, reply) => {
    const validation = await validateThemeDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const deleted = await deleteTheme(request.params.id);

    if (!deleted) {
      return notFound(reply, "theme not found or cannot be deleted", "THEME_NOT_FOUND");
    }

    return reply.code(204).send();
  });
};
