import type { FastifyPluginAsync } from "fastify";
import { playlistRoutes } from "./routes/playlist.js";
import { programRoutes } from "./routes/program.js";
import { scheduleRoutes } from "./routes/schedule.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { screenGroupsRoutes } from "./routes/screenGroups.js";
import { screensRoutes } from "./routes/screens.js";
import { statusRoutes } from "./routes/status.js";
import { themeRoutes } from "./routes/theme.js";

export const registerApi: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    service: "narrowcasting-api",
    status: "ready"
  }));

  app.register(playlistRoutes);
  app.register(programRoutes);
  app.register(scheduleRoutes);
  app.register(schedulerRoutes);
  app.register(screenGroupsRoutes);
  app.register(screensRoutes);
  app.register(statusRoutes);
  app.register(themeRoutes);
};
