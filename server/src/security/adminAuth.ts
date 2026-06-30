import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const adminKeyHeader = "x-narrowcasting-admin-key";
const adminProtectedReadPrefixes = [
  "/api/media",
  "/api/playlist",
  "/api/playlists",
  "/api/programs",
  "/api/themes",
  "/api/campaigns",
  "/api/assignments",
  "/api/screens",
  "/api/screen-groups",
  "/api/scheduler",
  "/api/status",
  "/api/player-cache",
  "/api/agent-status",
  "/api/audit"
];
let warnedAboutDevBypass = false;

function getConfiguredAdminKey() {
  return process.env.NARROWCASTING_ADMIN_KEY ?? process.env.ADMIN_KEY ?? "";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isReadMethod(method: string) {
  return method === "GET" || method === "HEAD";
}

function isAdminProtectedRead(request: FastifyRequest) {
  const path = request.url.split("?")[0];

  return adminProtectedReadPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isDeviceRuntimeMutation(request: FastifyRequest) {
  const path = request.url.split("?")[0];

  if (request.method !== "POST") {
    return false;
  }

  return path === "/api/screens/register" || /^\/api\/screens\/[^/]+\/heartbeat$/.test(path);
}

function isProtectedApiPath(request: FastifyRequest) {
  const path = request.url.split("?")[0];

  return path.startsWith("/api/");
}

function extractAdminKey(request: FastifyRequest) {
  const header = request.headers[adminKeyHeader];

  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const authorization = request.headers.authorization;

  if (typeof authorization === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function hasAdminAuthorization(request: FastifyRequest) {
  return extractAdminKey(request) !== null;
}

function keysMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: "unauthorized",
    code: "ADMIN_AUTH_REQUIRED",
    status: 401,
    message: "Admin authorization is required for this operation."
  });
}

function authNotConfigured(reply: FastifyReply) {
  return reply.code(503).send({
    error: "service_unavailable",
    code: "ADMIN_AUTH_NOT_CONFIGURED",
    status: 503,
    message: "Admin authorization is not configured on this server."
  });
}

export function authenticateAdminRequest(request: FastifyRequest, reply: FastifyReply) {
  const configuredAdminKey = getConfiguredAdminKey();

  if (!configuredAdminKey) {
    if (isProduction()) {
      authNotConfigured(reply);
      return false;
    }

    if (!warnedAboutDevBypass) {
      request.log.warn(
        "admin API management routes are unprotected because NARROWCASTING_ADMIN_KEY is not configured outside production"
      );
      warnedAboutDevBypass = true;
    }

    return true;
  }

  const providedAdminKey = extractAdminKey(request);

  if (!providedAdminKey || !keysMatch(providedAdminKey, configuredAdminKey)) {
    unauthorized(reply);
    return false;
  }

  return true;
}

export function registerAdminAuth(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (
      request.method === "OPTIONS" ||
      (isReadMethod(request.method) && !isAdminProtectedRead(request)) ||
      !isProtectedApiPath(request) ||
      isDeviceRuntimeMutation(request)
    ) {
      return;
    }

    if (authenticateAdminRequest(request, reply)) {
      return;
    }

    return reply;
  });
}
