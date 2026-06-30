import type { FastifyReply } from "fastify";
import { DomainValidationError, validationErrorResponse } from "../validation/domainValidation.js";

export interface ApiErrorBody {
  error: string;
  code: string;
  status: number;
  message: string;
}

function sendApiError(reply: FastifyReply, status: number, code: string, message: string) {
  const body: ApiErrorBody = {
    error: message,
    code,
    status,
    message
  };

  return reply.code(status).send(body);
}

export function badRequest(reply: FastifyReply, message: string, code = "BAD_REQUEST") {
  return sendApiError(reply, 400, code, message);
}

export function notFound(reply: FastifyReply, message: string, code = "NOT_FOUND") {
  return sendApiError(reply, 404, code, message);
}

export function conflict(reply: FastifyReply, body: unknown) {
  return reply.code(409).send(body);
}

export function payloadTooLarge(reply: FastifyReply, message: string, code = "PAYLOAD_TOO_LARGE") {
  return sendApiError(reply, 413, code, message);
}

export function internalError(reply: FastifyReply, message = "Internal server error") {
  return sendApiError(reply, 500, "INTERNAL_ERROR", message);
}

export function validationError(reply: FastifyReply, error: DomainValidationError) {
  return reply.code(400).send(validationErrorResponse(error));
}

export function badRequestForError(reply: FastifyReply, error: unknown, fallbackMessage: string) {
  if (error instanceof DomainValidationError) {
    return validationError(reply, error);
  }

  return badRequest(reply, error instanceof Error ? error.message : fallbackMessage);
}
