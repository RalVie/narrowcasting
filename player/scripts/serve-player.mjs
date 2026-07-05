import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, relative, resolve } from "node:path";

const host = process.env.PLAYER_HOST ?? "0.0.0.0";
const port = Number(process.env.PLAYER_PORT ?? 4174);
const appRoot = resolve(process.cwd());
const distRoot = resolve(appRoot, "dist");
const publicRoot = resolve(appRoot, "public");
const discoveryHostname = process.env.DISCOVERY_HOSTNAME ?? "http://narrowcasting.local:3000";
const discoveryTimeoutMs = Number(process.env.DISCOVERY_TIMEOUT_MS ?? 220);
const discoveryConcurrency = Number(process.env.DISCOVERY_CONCURRENCY ?? 25);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"]
]);

function isInside(root, filePath) {
  const relativePath = relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !resolve(filePath).includes("\0"));
}

async function sendFile(response, root, requestPath) {
  const cleanPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const filePath = resolve(join(root, cleanPath));

  if (!isInside(root, filePath)) {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "Content-Length": fileStat.size,
      ...getCacheHeaders(cleanPath)
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

function getCacheHeaders(cleanPath) {
  if (cleanPath === "index.html" || cleanPath === "data/schedule.json" || cleanPath.startsWith("data/")) {
    return {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Expires: "0",
      Pragma: "no-cache"
    };
  }

  if (cleanPath.startsWith("assets/")) {
    return {
      "Cache-Control": "public, max-age=31536000, immutable"
    };
  }

  if (cleanPath.startsWith("media/")) {
    return {
      "Cache-Control": "public, max-age=3600"
    };
  }

  return {
    "Cache-Control": "no-store"
  };
}

function sendJson(response, statusCode, body) {
  const content = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(content),
    "Cache-Control": "no-store"
  });
  response.end(content);
}

function normalizeServerUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function probeServer(serverUrl) {
  const normalizedUrl = normalizeServerUrl(serverUrl);

  if (!normalizedUrl) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), discoveryTimeoutMs);

  try {
    const response = await fetch(`${normalizedUrl}/api/status`, {
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();

    if (body?.application === "Narrowcasting Server" && typeof body.instanceId === "string") {
      return {
        serverUrl: normalizedUrl,
        status: body
      };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  return null;
}

function getLocalSubnetPrefixes() {
  const prefixes = new Set();

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      const parts = address.address.split(".");

      if (parts.length === 4) {
        prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }

  return [...prefixes];
}

async function scanSubnetForServer() {
  const candidates = getLocalSubnetPrefixes().flatMap((prefix) =>
    Array.from({ length: 254 }, (_, index) => `http://${prefix}.${index + 1}:3000`)
  );
  let cursor = 0;
  let found = null;

  async function worker() {
    while (!found && cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      const result = await probeServer(candidate);

      if (result) {
        found = {
          ...result,
          source: "subnet"
        };
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(discoveryConcurrency, candidates.length) }, () => worker())
  );

  return found;
}

async function discoverServer(knownUrl) {
  const knownResult = await probeServer(knownUrl);

  if (knownResult) {
    return {
      ...knownResult,
      source: "known"
    };
  }

  const mdnsResult = await probeServer(discoveryHostname);

  if (mdnsResult) {
    return {
      ...mdnsResult,
      source: "mdns"
    };
  }

  return scanSubnetForServer();
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("request body too large");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function savePlayerRegistration(body) {
  const registration = {
    screenId: typeof body?.screenId === "string" ? body.screenId : null,
    playerId: typeof body?.playerId === "string" ? body.playerId : null,
    serverUrl: normalizeServerUrl(body?.serverUrl) ?? null,
    deviceSecret: typeof body?.deviceSecret === "string" ? body.deviceSecret : null,
    updatedAt: new Date().toISOString()
  };

  await mkdir(resolve(publicRoot, "data"), { recursive: true });
  await writeFile(
    resolve(publicRoot, "data", "player-registration.json"),
    `${JSON.stringify(registration, null, 2)}\n`,
    "utf8"
  );
  return registration;
}

function logPlayerDebug(body, request) {
  const payload = body && typeof body === "object" ? body : {};
  const event = typeof payload.event === "string" ? payload.event : "unknown";
  const level = typeof payload.level === "string" ? payload.level : "info";
  const category = typeof payload.category === "string" ? payload.category : "player";
  const details = payload.details && typeof payload.details === "object" ? payload.details : {};

  const entry = {
    at: new Date().toISOString(),
    category,
    details,
    event,
    level,
    remoteAddress: request.socket.remoteAddress ?? null
  };

  if (level === "warn") {
    console.warn("player debug", entry);
  } else if (level === "error") {
    console.error("player debug", entry);
  } else {
    console.log("player debug", entry);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (path === "/" || path === "/player" || path.startsWith("/player/")) {
    await sendFile(response, distRoot, "index.html");
    return;
  }

  if (path === "/api/discovery") {
    const result = await discoverServer(url.searchParams.get("known"));

    if (result) {
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, {
      error: "Narrowcasting server not found"
    });
    return;
  }

  if (path === "/api/player-registration" && request.method === "POST") {
    try {
      const body = await readRequestJson(request);
      const registration = await savePlayerRegistration(body);
      sendJson(response, 200, registration);
    } catch {
      sendJson(response, 400, { error: "invalid registration payload" });
    }
    return;
  }

  if (path === "/api/debug-log" && request.method === "POST") {
    try {
      const body = await readRequestJson(request);
      logPlayerDebug(body, request);
      sendJson(response, 200, { ok: true });
    } catch {
      sendJson(response, 400, { error: "invalid debug log payload" });
    }
    return;
  }

  if (path.startsWith("/assets/")) {
    await sendFile(response, distRoot, path);
    return;
  }

  if (path.startsWith("/data/") || path.startsWith("/media/")) {
    await sendFile(response, publicRoot, path);
    return;
  }

  response.writeHead(404);
  response.end("Not found");
});

server.listen(port, host, () => {
  console.log(`narrowcasting player available at http://${host}:${port}/player`);
});
