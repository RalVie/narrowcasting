import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";

const mediaRoot = resolve(process.cwd(), "public", "media");

function getContentType(file: string) {
  switch (extname(file).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { file: string } }>("/media/:file", async (request, reply) => {
    const file = basename(request.params.file);
    const filePath = resolve(mediaRoot, file);

    if (!filePath.startsWith(mediaRoot) || file !== request.params.file) {
      return reply.code(400).send({ error: "invalid media file" });
    }

    try {
      await access(filePath);
    } catch {
      return reply.code(404).send({ error: "media file not found" });
    }

    return reply.type(getContentType(file)).send(createReadStream(filePath));
  });
};
