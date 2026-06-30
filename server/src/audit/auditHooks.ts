import type { FastifyInstance, FastifyRequest } from "fastify";
import { appendAuditEvent, fingerprintSecret, type AuditActorType } from "./auditStore.js";

const adminKeyHeader = "x-narrowcasting-admin-key";

const objectTypeByCollection: Record<string, string> = {
  assignments: "Assignment",
  campaigns: "Campaign",
  media: "Media",
  playlist: "Playlist",
  playlists: "Playlist",
  programs: "Program",
  scheduler: "Scheduler",
  screens: "Screen",
  "screen-groups": "ScreenGroup",
  themes: "Theme"
};

function pathWithoutQuery(request: FastifyRequest) {
  return request.url.split("?")[0];
}

function isMutation(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function shouldAudit(request: FastifyRequest) {
  const path = pathWithoutQuery(request);

  if (!path.startsWith("/api/") || !isMutation(request.method)) {
    return false;
  }

  // Heartbeats are high-volume operational telemetry, not operator traceability.
  return !/^\/api\/screens\/[^/]+\/heartbeat$/.test(path);
}

function getHeaderString(request: FastifyRequest, headerName: string) {
  const value = request.headers[headerName];

  return typeof value === "string" ? value : null;
}

function extractAdminKey(request: FastifyRequest) {
  const header = getHeaderString(request, adminKeyHeader);

  if (header?.trim()) {
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

export function actorFromRequest(request: FastifyRequest, statusCode: number): {
  actorType: AuditActorType;
  actorId: string | null;
  source: string;
} {
  const path = pathWithoutQuery(request);

  if (path === "/api/screens/register") {
    const body = request.body as { playerId?: unknown } | undefined;

    return {
      actorType: "device",
      actorId: typeof body?.playerId === "string" ? body.playerId : null,
      source: "device-registration"
    };
  }

  const adminKey = extractAdminKey(request);

  if (statusCode !== 401 && statusCode !== 503 && adminKey) {
    return {
      actorType: "admin",
      actorId: `admin-key:${fingerprintSecret(adminKey)}`,
      source: "dashboard-admin"
    };
  }

  if (statusCode !== 401 && statusCode !== 503 && !adminKey && process.env.NODE_ENV !== "production") {
    return {
      actorType: "admin",
      actorId: "development-bypass",
      source: "dashboard-admin-dev-bypass"
    };
  }

  return {
    actorType: "anonymous",
    actorId: null,
    source: "api"
  };
}

function inferObjectName(request: FastifyRequest) {
  const body = request.body as { name?: unknown; filename?: unknown } | undefined;

  if (typeof body?.name === "string" && body.name.trim()) {
    return body.name.trim().slice(0, 240);
  }

  if (typeof body?.filename === "string" && body.filename.trim()) {
    return body.filename.trim().slice(0, 240);
  }

  return null;
}

function inferAction(collection: string, segments: string[], method: string) {
  const lastSegment = segments.at(-1);

  if (collection === "media" && method === "POST") {
    return "upload";
  }

  if (collection === "campaigns" && segments.length === 1 && method === "POST") {
    return "create_publish";
  }

  if (collection === "campaigns" && lastSegment === "validate") {
    return "validate";
  }

  if (collection === "campaigns" && lastSegment === "update") {
    return "update_publish";
  }

  if (collection === "screens" && lastSegment === "register") {
    return "register";
  }

  if (collection === "screens" && lastSegment === "approve") {
    return "approve";
  }

  if (collection === "screens" && lastSegment === "rename") {
    return "update";
  }

  if (lastSegment === "delete" || method === "DELETE") {
    return "delete";
  }

  if (lastSegment === "rename" || lastSegment === "add" || lastSegment === "remove") {
    return "update";
  }

  if (method === "POST" && segments.length === 1) {
    return "create";
  }

  if (method === "PUT" || lastSegment === "update") {
    return "update";
  }

  return method.toLowerCase();
}

function inferAuditTarget(request: FastifyRequest) {
  const path = pathWithoutQuery(request);
  const segments = path.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const collection = segments[0] ?? "api";
  const objectType = objectTypeByCollection[collection] ?? collection;
  const objectId =
    segments.length > 1 && !["validate", "register"].includes(segments[1])
      ? decodeURIComponent(segments[1])
      : null;

  return {
    action: inferAction(collection, segments, request.method.toUpperCase()),
    objectType,
    objectId,
    objectName: inferObjectName(request)
  };
}

function statusReason(statusCode: number) {
  if (statusCode === 401) {
    return "Unauthorized mutation attempt.";
  }

  if (statusCode === 403) {
    return "Forbidden mutation attempt.";
  }

  if (statusCode === 400) {
    return "Mutation rejected by request or validation rules.";
  }

  if (statusCode === 409) {
    return "Mutation rejected by conflict, reference integrity, ownership, or confirmation rules.";
  }

  if (statusCode >= 500) {
    return "Mutation failed with server error.";
  }

  return "Mutation completed.";
}

export function registerAuditHooks(app: FastifyInstance) {
  app.addHook("onResponse", async (request, reply) => {
    if (!shouldAudit(request)) {
      return;
    }

    const actor = actorFromRequest(request, reply.statusCode);
    const target = inferAuditTarget(request);

    try {
      await appendAuditEvent({
        ...actor,
        action: target.action,
        objectType: target.objectType,
        objectId: target.objectId,
        objectName: target.objectName,
        result: reply.statusCode < 400 ? "success" : "failure",
        reason: statusReason(reply.statusCode),
        correlationId: request.id,
        metadata: {
          method: request.method,
          path: pathWithoutQuery(request),
          statusCode: reply.statusCode
        }
      });
    } catch (error) {
      request.log.error({ error }, "audit event append failed");
    }
  });
}
