import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import {
  createMedia,
  createExternalMedia,
  deleteMedia,
  getMediaContentType,
  getMediaPath,
  listMedia,
  updateExternalMedia
} from "../../media/mediaStore.js";
import { badRequest, badRequestForError, conflict, notFound, payloadTooLarge } from "../apiErrors.js";
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

  app.post("/api/media/external", async (request, reply) => {
    try {
      const item = await createExternalMedia(request.body ?? {});
      return reply.code(201).send(item);
    } catch (error) {
      return badRequestForError(reply, error, "external media creation failed");
    }
  });

  app.post<{ Params: { id: string } }>("/api/media/:id/external", async (request, reply) => {
    try {
      const item = await updateExternalMedia(request.params.id, request.body ?? {});

      if (!item) {
        return notFound(reply, "media item not found", "MEDIA_NOT_FOUND");
      }

      return item;
    } catch (error) {
      return badRequestForError(reply, error, "external media update failed");
    }
  });

  app.post("/api/media", async (request, reply) => {
    try {
      const uploadedFile = await request.file();

      if (!uploadedFile) {
        return badRequest(reply, "missing media upload", "MEDIA_UPLOAD_REQUIRED");
      }

      const isImageUpload = uploadedFile.mimetype.startsWith("image/");
      const isVideoUpload =
        uploadedFile.mimetype === "video/mp4" || uploadedFile.mimetype === "video/webm";

      if (!isImageUpload && !isVideoUpload) {
        return badRequest(reply, "only image and mp4/webm video uploads are supported", "UNSUPPORTED_MEDIA_TYPE");
      }

      const content = await uploadedFile.toBuffer();

      if (isImageUpload && content.byteLength > imageUploadLimitBytes) {
        return payloadTooLarge(reply, imageTooLargeMessage);
      }

      const item = await createMedia(uploadedFile.filename, content);
      return reply.code(201).send(item);
    } catch (error) {
      if (isMultipartSizeLimitError(error)) {
        return payloadTooLarge(reply, videoTooLargeMessage);
      }

      return badRequestForError(reply, error, "media upload failed");
    }
  });

  app.delete<{ Params: { id: string } }>("/api/media/:id", async (request, reply) => {
    const validation = await validateMediaDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const deleted = await deleteMedia(request.params.id);

    if (!deleted) {
      return notFound(reply, "media item not found", "MEDIA_NOT_FOUND");
    }

    return reply.code(204).send();
  });

  app.get<{ Params: { file: string } }>("/media/:file", async (request, reply) => {
    let filePath: string;

    try {
      filePath = getMediaPath(request.params.file);
    } catch {
      return badRequest(reply, "invalid media file", "INVALID_MEDIA_FILE");
    }

    try {
      await access(filePath);
    } catch {
      return notFound(reply, "media file not found", "MEDIA_FILE_NOT_FOUND");
    }

    return reply.type(getMediaContentType(request.params.file)).send(createReadStream(filePath));
  });
};
