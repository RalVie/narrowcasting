import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

const dashboardRoot = resolve(process.cwd(), "..", "dashboard", "dist");
const dashboardIndex = resolve(dashboardRoot, "index.html");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"]
]);

function isInside(root: string, filePath: string) {
  const relativePath = relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !filePath.includes("\0"));
}

async function sendDashboardFile(reply: FastifyReply, filePath: string) {
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error("not a file");
  }

  return reply
    .type(contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream")
    .header("Cache-Control", "no-store")
    .send(createReadStream(filePath));
}

export function registerDashboardStatic(app: FastifyInstance) {
  const enabled = existsSync(dashboardIndex);

  app.log.info(
    {
      enabled,
      dashboardPath: dashboardRoot
    },
    enabled ? "dashboard static serving enabled" : "dashboard static serving disabled"
  );

  if (!enabled) {
    app.get("/", async (_request, reply) =>
      reply.code(404).send({
        error: "dashboard build not found",
        dashboardPath: dashboardRoot
      })
    );
    return;
  }

  app.get("/", async (_request, reply) => sendDashboardFile(reply, dashboardIndex));

  app.get("/*", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "/";

    if (
      path.startsWith("/api/") ||
      path === "/api" ||
      path.startsWith("/media/") ||
      path.startsWith("/health")
    ) {
      return reply.code(404).send({ error: "not found" });
    }

    const requestedFile = resolve(dashboardRoot, decodeURIComponent(path).replace(/^\/+/, ""));

    if (isInside(dashboardRoot, requestedFile)) {
      try {
        return await sendDashboardFile(reply, requestedFile);
      } catch {
        return sendDashboardFile(reply, dashboardIndex);
      }
    }

    return reply.code(400).send({ error: "invalid dashboard path" });
  });
}
