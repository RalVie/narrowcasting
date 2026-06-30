import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getScreenById, type ScreenRecord } from "../screens/screenStore.js";

const deviceSecretHeader = "x-narrowcasting-device-secret";

function readDeviceSecret(request: FastifyRequest) {
  const header = request.headers[deviceSecretHeader];

  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const authorization = request.headers.authorization;

  if (typeof authorization === "string") {
    const match = /^Device\s+(.+)$/i.exec(authorization);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const query = request.query as { deviceSecret?: unknown } | undefined;

  return typeof query?.deviceSecret === "string" && query.deviceSecret.trim()
    ? query.deviceSecret.trim()
    : null;
}

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function deviceAuthRequired(reply: FastifyReply) {
  return reply.code(401).send({
    error: "unauthorized",
    code: "DEVICE_AUTH_REQUIRED",
    status: 401,
    message: "Device authorization is required for this operation."
  });
}

export function deviceAuthFailed(reply: FastifyReply) {
  return reply.code(401).send({
    error: "unauthorized",
    code: "INVALID_DEVICE_SECRET",
    status: 401,
    message: "Device authorization failed."
  });
}

export function unknownScreen(reply: FastifyReply) {
  return reply.code(404).send({
    error: "not_found",
    code: "SCREEN_NOT_FOUND",
    status: 404,
    message: "Screen was not found."
  });
}

export function screenNotApproved(reply: FastifyReply) {
  return reply.code(403).send({
    error: "forbidden",
    code: "SCREEN_NOT_APPROVED",
    status: 403,
    message: "Screen is not approved for runtime communication."
  });
}

export async function authenticateScreenDevice(
  request: FastifyRequest,
  reply: FastifyReply,
  screenId: string
): Promise<ScreenRecord | null> {
  const deviceSecret = readDeviceSecret(request);

  if (!deviceSecret) {
    deviceAuthRequired(reply);
    return null;
  }

  const screen = await getScreenById(screenId);

  if (!screen) {
    unknownScreen(reply);
    return null;
  }

  if (screen.status !== "approved") {
    screenNotApproved(reply);
    return null;
  }

  if (!screen.deviceSecret || !secretsMatch(deviceSecret, screen.deviceSecret)) {
    deviceAuthFailed(reply);
    return null;
  }

  return screen;
}
