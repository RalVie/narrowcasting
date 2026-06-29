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
import { validateMediaDelete } from "../../validation/referenceIntegrity.js";

const imageUploadLimitBytes = 20 * 1024 * 1024;
const videoUploadLimitBytes = 500 * 1024 * 1024;
const imageTooLargeMessage = "Image is too large. Maximum allowed size is 20 MB.";
const videoTooLargeMessage = "Video is too large. Maximum allowed size is 500 MB.";

function isMultipartSizeLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = (error as { code?: string }).code;
  return errorCode === "FST_REQ_FILE_TOO_LARGE" || error.message.toLowerCase().includes("too large");
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.register(multipart, {
    limits: {
      fileSize: videoUploadLimitBytes,
      files: 1
    }
  });

  app.get("/api/media", async () => listMedia());

  app.post("/api/media", async (request, reply) => {
    try {
      const uploadedFile = await request.file();

      if (!uploadedFile) {
        return reply.code(400).send({ error: "missing media upload" });
      }

      const isImageUpload = uploadedFile.mimetype.startsWith("image/");
      const isVideoUpload =
        uploadedFile.mimetype === "video/mp4" || uploadedFile.mimetype === "video/webm";

      if (!isImageUpload && !isVideoUpload) {
        return reply.code(400).send({ error: "only image and mp4/webm video uploads are supported" });
      }

      const content = await uploadedFile.toBuffer();

      if (isImageUpload && content.byteLength > imageUploadLimitBytes) {
        return reply.code(413).send({ error: imageTooLargeMessage });
      }

      const item = await createMedia(uploadedFile.filename, content);
      return reply.code(201).send(item);
    } catch (error) {
      if (isMultipartSizeLimitError(error)) {
        return reply.code(413).send({ error: videoTooLargeMessage });
      }

      return reply.code(400).send({
        error: error instanceof Error ? error.message : "media upload failed"
      });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/media/:id", async (request, reply) => {
    const validation = await validateMediaDelete(request.params.id);

    if (!validation.ok) {
      return reply.code(409).send(validation.error);
    }

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
