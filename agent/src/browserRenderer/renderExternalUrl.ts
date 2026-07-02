import { setTimeout as delay } from "node:timers/promises";
import { CdpConnection, listChromiumTargets, selectKioskTarget } from "./cdpClient.js";

export interface BrowserRenderRequest {
  durationSeconds: number;
  playerUrl: string;
  url: string;
}

export interface BrowserRendererOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

export async function renderExternalUrl(
  request: BrowserRenderRequest,
  options: BrowserRendererOptions
): Promise<void> {
  if (!isHttpUrl(request.url)) {
    throw new Error("URL must be an absolute http or https URL");
  }

  if (!isHttpUrl(request.playerUrl)) {
    throw new Error("Player URL must be an absolute http or https URL");
  }

  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new Error("Duration must be a positive number of seconds");
  }

  const targets = await listChromiumTargets(options);
  const target = selectKioskTarget(targets, request.playerUrl);

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No Chromium page target found. Is the kiosk running with remote debugging enabled?");
  }

  console.log("browser renderer selected chromium target", {
    id: target.id,
    title: target.title,
    url: target.url
  });

  const connection = new CdpConnection(options);
  let connected = false;

  try {
    await connection.connect(target.webSocketDebuggerUrl);
    connected = true;
    await connection.send("Page.enable");

    console.log("browser renderer navigating to external URL", { url: request.url });
    await navigateAndWait(connection, request.url, options.timeoutMs);

    console.log("browser renderer external URL active", {
      durationSeconds: request.durationSeconds,
      url: request.url
    });
    await delay(request.durationSeconds * 1000);
  } finally {
    if (connected) {
      console.log("browser renderer returning to player", { playerUrl: request.playerUrl });

      try {
        await navigateAndWait(connection, request.playerUrl, options.timeoutMs);
        console.log("browser renderer returned to player", { playerUrl: request.playerUrl });
      } finally {
        connection.close();
      }
    }
  }
}

async function navigateAndWait(connection: CdpConnection, url: string, timeoutMs: number): Promise<void> {
  const loaded = waitForCdpEvent(connection, "Page.loadEventFired", timeoutMs);
  await connection.send("Page.navigate", { url });

  try {
    await loaded;
  } catch (error) {
    console.warn("browser renderer navigation did not report load before timeout", {
      error: error instanceof Error ? error.message : String(error),
      url
    });
  }
}

function waitForCdpEvent(connection: CdpConnection, eventName: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const unsubscribe = connection.on(eventName, () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}
