import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AgentConfig } from "../config/loadAgentConfig.js";
import { renderExternalUrl } from "./renderExternalUrl.js";

interface BrowserRenderPayload {
  durationSeconds?: unknown;
  playerUrl?: unknown;
  url?: unknown;
}

let activeRender: Promise<void> | null = null;

export function startBrowserRendererControlServer(config: AgentConfig) {
  if (!config.browserRendererEnabled) {
    console.log("browser renderer control disabled");
    return;
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response, config);
  });

  server.listen(config.browserRendererControlPort, config.browserRendererControlHost, () => {
    console.log("browser renderer control listening", {
      host: config.browserRendererControlHost,
      port: config.browserRendererControlPort
    });
  });

  server.on("error", (error) => {
    console.error("browser renderer control server failed", error);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, config: AgentConfig) {
  if (request.method === "OPTIONS") {
    writeCorsHeaders(response, request.headers.origin);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/browser-renderer/render") {
    writeJson(response, 404, { ok: false, error: "not_found" }, request.headers.origin);
    return;
  }

  writeCorsHeaders(response, request.headers.origin);

  if (activeRender) {
    writeJson(response, 409, { ok: false, error: "browser_renderer_busy" }, request.headers.origin);
    return;
  }

  let payload: BrowserRenderPayload;

  try {
    payload = JSON.parse(await readBody(request)) as BrowserRenderPayload;
  } catch {
    writeJson(response, 400, { ok: false, error: "invalid_json" }, request.headers.origin);
    return;
  }

  if (typeof payload.url !== "string" || typeof payload.playerUrl !== "string") {
    writeJson(response, 400, { ok: false, error: "invalid_browser_render_request" }, request.headers.origin);
    return;
  }

  const durationSeconds = Number(payload.durationSeconds);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    writeJson(response, 400, { ok: false, error: "invalid_duration" }, request.headers.origin);
    return;
  }

  const renderPromise = renderExternalUrl(
    {
      durationSeconds,
      playerUrl: payload.playerUrl,
      url: payload.url
    },
    {
      host: config.chromiumCdpHost,
      port: config.chromiumCdpPort,
      timeoutMs: config.browserRendererTimeoutMs
    }
  );

  activeRender = renderPromise;
  renderPromise
    .then(() => {
      console.log("browser renderer request completed", {
        durationSeconds,
        url: payload.url
      });
    })
    .catch((error: unknown) => {
      console.error("browser renderer request failed", error);
    })
    .finally(() => {
      if (activeRender === renderPromise) {
        activeRender = null;
      }
    });

  writeJson(response, 202, { ok: true, status: "accepted" }, request.headers.origin);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;

      if (body.length > 16_384) {
        request.destroy();
        reject(new Error("request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeCorsHeaders(response: ServerResponse, origin?: string) {
  const allowedOrigin = origin === "http://localhost:4174" || origin === "http://127.0.0.1:4174"
    ? origin
    : "http://localhost:4174";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown, origin?: string) {
  writeCorsHeaders(response, origin);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`${JSON.stringify(value)}\n`);
}
