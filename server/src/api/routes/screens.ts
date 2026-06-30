import type { FastifyPluginAsync } from "fastify";
import {
  approveScreen,
  getScreenById,
  listScreens,
  registerScreen,
  renameScreen,
  updateScreenHeartbeat
} from "../../screens/screenStore.js";
import { badRequest, notFound } from "../apiErrors.js";
import { authenticateScreenDevice } from "../../security/deviceAuth.js";

function toScreenResponse(screen: Awaited<ReturnType<typeof registerScreen>>, includeDeviceSecret = false) {
  const { deviceSecret, ...publicScreen } = screen;

  return includeDeviceSecret ? { ...publicScreen, deviceSecret } : publicScreen;
}

export const screensRoutes: FastifyPluginAsync = async (app) => {
  app.get("/screens", async () => (await listScreens()).map((screen) => toScreenResponse(screen)));

  app.post("/screens/register", async (request, reply) => {
    try {
      const screen = await registerScreen(request.body ?? {});
      return reply
        .code(screen.status === "pending" ? 202 : 200)
        .send(toScreenResponse(screen, screen.status === "approved"));
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : "invalid screen registration");
    }
  });

  app.post<{ Params: { id: string } }>("/screens/:id/approve", async (request, reply) => {
    const screen = await approveScreen(request.params.id);

    if (!screen) {
      return notFound(reply, "screen not found", "SCREEN_NOT_FOUND");
    }

    return reply.send(toScreenResponse(screen));
  });

  app.post<{ Params: { id: string } }>("/screens/:id/rename", async (request, reply) => {
    const body = request.body as { name?: unknown } | undefined;
    const screen = await renameScreen(request.params.id, body?.name);

    if (!screen) {
      return notFound(reply, "screen not found", "SCREEN_NOT_FOUND");
    }

    return reply.send(toScreenResponse(screen));
  });

  app.post<{ Params: { id: string } }>("/screens/:id/heartbeat", async (request, reply) => {
    const authenticatedScreen = await authenticateScreenDevice(request, reply, request.params.id);

    if (!authenticatedScreen) {
      return reply;
    }

    const screen = await updateScreenHeartbeat(request.params.id, request.body ?? {});

    if (!screen) {
      return notFound(reply, "screen not found or heartbeat rejected", "SCREEN_NOT_FOUND");
    }

    return reply.send(toScreenResponse(screen));
  });

  app.get<{ Params: { id: string } }>("/screens/:id/assignment", async (request, reply) => {
    const screen = await getScreenById(request.params.id);

    if (!screen) {
      return notFound(reply, "screen not found", "SCREEN_NOT_FOUND");
    }

    return reply.send({
      screenId: screen.screenId,
      message: "screen assignments are managed by /api/assignments"
    });
  });
};
