import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import {
  createMedia,
  deleteMedia,
  getMediaContentType,
  getMediaPath,
  listMedia
} from "../../media/mediaStore.js";

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1
    }
  });

  app.get("/api/media", async () => listMedia());

  app.post("/api/media", async (request, reply) => {
    const uploadedFile = await request.file();

    if (!uploadedFile) {
      return reply.code(400).send({ error: "missing image upload" });
    }

    if (!uploadedFile.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "only image uploads are supported" });
    }

    try {
      const item = await createMedia(uploadedFile.filename, await uploadedFile.toBuffer());
      return reply.code(201).send(item);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "media upload failed"
      });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/media/:id", async (request, reply) => {
    const deleted = await deleteMedia(request.params.id);

    if (!deleted) {
      return reply.code(404).send({ error: "media item not found" });
    }

    return reply.code(204).send();
  });

  app.get<{ Params: { file: string } }>("/media/:file", async (request, reply) => {
    let filePath: string;

    try {
      filePath = getMediaPath(request.params.file);
    } catch {
      return reply.code(400).send({ error: "invalid media file" });
    }

    try {
      await access(filePath);
    } catch {
      return reply.code(404).send({ error: "media file not found" });
    }

    return reply.type(getMediaContentType(request.params.file)).send(createReadStream(filePath));
  });
};
