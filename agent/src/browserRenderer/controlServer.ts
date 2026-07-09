import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AgentConfig } from "../config/loadAgentConfig.js";
import {
  type BrowserRendererStopReason,
  type BrowserRendererRuntimeStatus,
  idleBrowserRendererStatus,
  writeBrowserRendererStatus
} from "./browserRendererStatus.js";
import { renderExternalUrl } from "./renderExternalUrl.js";
import type { BrowserAction } from "../../../shared/runtime.js";

interface BrowserRenderPayload {
  durationSeconds?: unknown;
  playbackMode?: unknown;
  playerUrl?: unknown;
  url?: unknown;
  browserActions?: unknown;
}

let activeRender: Promise<void> | null = null;
let activeRenderController: AbortController | null = null;
let activeStopReason: BrowserRendererStopReason | null = null;

export function isBrowserRendererActive() {
  return activeRender !== null;
}

export function cancelActiveBrowserRenderer(reason: string) {
  if (!activeRenderController) {
    return;
  }

  activeStopReason = "schedule_changed";
  console.log("browser session cancelled due to schedule update", { reason });
  activeRenderController.abort();
}

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

  const playbackMode = payload.playbackMode === "persistent" ? "persistent" : "timed";
  const durationSeconds = Number(payload.durationSeconds);

  if (playbackMode === "timed" && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    writeJson(response, 400, { ok: false, error: "invalid_duration" }, request.headers.origin);
    return;
  }

  const controller = new AbortController();
  const runningSince = new Date().toISOString();
  activeRenderController = controller;
  activeStopReason = null;

  await updateBrowserRendererStatus(config, {
    status: "starting",
    currentUrl: payload.url,
    playbackMode,
    runningSince,
    lastUpdatedAt: new Date().toISOString(),
    lastStopReason: null,
    currentTitle: null,
    navigationState: "loading",
    error: null
  });
  const renderPromise = renderExternalUrl(
    {
      durationSeconds: playbackMode === "timed" ? durationSeconds : undefined,
      playbackMode,
      playerUrl: payload.playerUrl,
      url: payload.url,
      browserActions: normalizeBrowserActions(payload.browserActions),
      signal: controller.signal,
      onStateChange: (state) =>
        updateBrowserRendererStatus(config, {
          status: state.status,
          currentUrl: state.currentUrl ?? null,
          playbackMode,
          runningSince,
          lastUpdatedAt: new Date().toISOString(),
          lastStopReason: null,
          currentTitle: state.currentTitle ?? null,
          navigationState: state.navigationState ?? null,
          error: null
        })
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
        browserActions: Array.isArray(payload.browserActions) ? payload.browserActions.length : 0,
        durationSeconds: playbackMode === "timed" ? durationSeconds : null,
        playbackMode,
        url: payload.url
      });
      void updateBrowserRendererStatus(config, {
        ...idleBrowserRendererStatus,
        lastUpdatedAt: new Date().toISOString(),
        lastStopReason: playbackMode === "timed" ? "timed_playback_finished" : activeStopReason
      });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        const stopReason = activeStopReason ?? "manual_cancel";
        console.warn("browser renderer request cancelled", {
          reason: stopReason
        });
        void updateBrowserRendererStatus(config, {
          ...idleBrowserRendererStatus,
          lastUpdatedAt: new Date().toISOString(),
          lastStopReason: stopReason
        });
      } else {
        console.error("browser renderer request failed", error);
        void updateBrowserRendererStatus(config, {
          status: "error",
          currentUrl: typeof payload.url === "string" ? payload.url : null,
          playbackMode,
          runningSince: null,
          lastUpdatedAt: new Date().toISOString(),
          lastStopReason: "navigation_failed",
          currentTitle: null,
          navigationState: "failed",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })
    .finally(() => {
      if (activeRender === renderPromise) {
        activeRender = null;
      }
      if (activeRenderController === controller) {
        activeRenderController = null;
      }
      activeStopReason = null;
    });

  writeJson(response, 202, { ok: true, status: "accepted" }, request.headers.origin);
}

async function updateBrowserRendererStatus(config: AgentConfig, status: BrowserRendererRuntimeStatus) {
  try {
    await writeBrowserRendererStatus(config, status);
  } catch (error) {
    console.warn("browser renderer status update failed", {
      error: error instanceof Error ? error.message : String(error),
      status: status.status
    });
  }
}

function normalizeBrowserActions(value: unknown): BrowserAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 5).flatMap((candidate): BrowserAction[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const action = candidate as Partial<BrowserAction> & Record<string, unknown>;

    if (action.type === "wait") {
      return [
        {
          type: "wait",
          waitMs: Math.max(Math.min(Number(action.waitMs ?? 1000), 15_000), 0)
        }
      ];
    }

    if (action.type === "click") {
      const selector = typeof action.selector === "string" ? action.selector.trim() : "";
      if (!selector) {
        return [];
      }

      return [
        {
          type: "click",
          selector,
          timeoutMs: Math.max(Math.min(Number(action.timeoutMs ?? 5000), 15_000), 0)
        }
      ];
    }

    if (action.type === "refresh_interval") {
      return [
        {
          type: "refresh_interval",
          intervalSeconds: Math.max(Number(action.intervalSeconds ?? 300), 30)
        }
      ];
    }

    return [];
  });
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
