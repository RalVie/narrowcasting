import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import multipart from "@fastify/multipart";
import {
  createMedia,
  createExternalMedia,
  deleteTrashedMediaPermanently,
  getMediaContentType,
  getMediaPath,
  listMedia,
  listTrashedMedia,
  moveMediaToTrash,
  restoreMediaFromTrash,
  retryVideoNormalization,
  updateExternalMedia
} from "../../media/mediaStore.js";
import { badRequest, badRequestForError, conflict, notFound, payloadTooLarge } from "../apiErrors.js";
import { analyzeMediaUsage, removeMediaFromAllReferences, validateMediaDelete } from "../../validation/referenceIntegrity.js";
import { fetchRssFeed } from "../../rss/rssFetcher.js";

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

function parsePreviewMaxItems(value: unknown) {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 5;
  }

  return Math.min(Math.max(Math.floor(parsedValue), 1), 20);
}

function parsePreviewUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.register(multipart, {
    limits: {
      fileSize: videoUploadLimitBytes,
      files: 1
    }
  });

  app.get("/api/media", async () => listMedia());

  app.get("/api/media/trash", async () => listTrashedMedia());

  app.post("/api/media/rss-preview", async (request) => {
    const body = (request.body ?? {}) as { url?: unknown; maxItems?: unknown };
    const url = parsePreviewUrl(body.url);
    const maxItems = parsePreviewMaxItems(body.maxItems);

    return fetchRssFeed(url, maxItems);
  });

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

  app.post<{ Params: { id: string } }>("/api/media/:id/retry-normalization", async (request, reply) => {
    try {
      const item = await retryVideoNormalization(request.params.id);

      if (!item) {
        return notFound(reply, "media item not found", "MEDIA_NOT_FOUND");
      }

      return item;
    } catch (error) {
      return badRequestForError(reply, error, "video normalization retry failed");
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

  app.get<{ Params: { id: string } }>("/api/media/:id/usage", async (request, reply) => {
    const usage = await analyzeMediaUsage(request.params.id);

    if (!usage) {
      return notFound(reply, "media item not found", "MEDIA_NOT_FOUND");
    }

    return usage;
  });

  app.post<{ Body: { removeReferences?: boolean }; Params: { id: string } }>("/api/media/:id/trash", async (request, reply) => {
    const validation = await validateMediaDelete(request.params.id);

    if (!validation.ok && !request.body?.removeReferences) {
      return conflict(reply, validation.error);
    }

    const removedReferences = !validation.ok && request.body?.removeReferences
      ? await removeMediaFromAllReferences(request.params.id)
      : null;
    const item = await moveMediaToTrash(request.params.id);

    if (!item) {
      return notFound(reply, "media item not found", "MEDIA_NOT_FOUND");
    }

    return {
      item,
      removedReferences,
      message: removedReferences
        ? "Media moved to Trash after removing references. Affected content may need republishing."
        : "Media moved to Trash."
    };
  });

  app.post<{ Params: { id: string } }>("/api/media/:id/restore", async (request, reply) => {
    try {
      const item = await restoreMediaFromTrash(request.params.id);

      if (!item) {
        return notFound(reply, "trashed media item not found", "MEDIA_NOT_FOUND");
      }

      return item;
    } catch (error) {
      return conflict(reply, {
        error: "validation_error",
        code: "MEDIA_RESTORE_CONFLICT",
        message: error instanceof Error ? error.message : "Media could not be restored."
      });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/media/:id/permanent", async (request, reply) => {
    const deleted = await deleteTrashedMediaPermanently(request.params.id);

    if (!deleted) {
      return notFound(reply, "trashed media item not found", "MEDIA_NOT_FOUND");
    }

    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>("/api/media/:id", async (request, reply) => {
    const validation = await validateMediaDelete(request.params.id);

    if (!validation.ok) {
      return conflict(reply, validation.error);
    }

    const item = await moveMediaToTrash(request.params.id);

    if (!item) {
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
