import { setTimeout as delay } from "node:timers/promises";
import { CdpConnection, listChromiumTargets, selectKioskTarget } from "./cdpClient.js";

const DEFAULT_PLAYER_URL = "http://localhost:4174/player";
const DEFAULT_DURATION_SECONDS = 30;
const DEFAULT_TIMEOUT_MS = 15_000;

interface BrowserRendererOptions {
  cdpHost: string;
  cdpPort: number;
  durationSeconds: number;
  playerUrl: string;
  timeoutMs: number;
  url: string;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  console.log("browser renderer test starting", {
    cdp: `${options.cdpHost}:${options.cdpPort}`,
    durationSeconds: options.durationSeconds,
    playerUrl: options.playerUrl,
    url: options.url
  });

  if (!isHttpUrl(options.url)) {
    throw new Error("URL must be an absolute http or https URL");
  }

  const targets = await listChromiumTargets({
    host: options.cdpHost,
    port: options.cdpPort,
    timeoutMs: options.timeoutMs
  });

  console.log("chromium targets found", targets.map((target) => ({
    id: target.id,
    title: target.title,
    type: target.type,
    url: target.url
  })));

  const target = selectKioskTarget(targets, options.playerUrl);

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No Chromium page target found. Is the kiosk running with remote debugging enabled?");
  }

  console.log("selected chromium target", {
    id: target.id,
    title: target.title,
    url: target.url
  });

  const connection = new CdpConnection({
    host: options.cdpHost,
    port: options.cdpPort,
    timeoutMs: options.timeoutMs
  });

  let connected = false;

  try {
    await connection.connect(target.webSocketDebuggerUrl);
    connected = true;
    await connection.send("Page.enable");

    console.log("navigating kiosk to external URL", { url: options.url });
    await navigateAndWait(connection, options.url, options.timeoutMs);

    console.log("external URL active", {
      durationSeconds: options.durationSeconds,
      url: options.url
    });
    await delay(options.durationSeconds * 1000);
  } finally {
    if (connected) {
      console.log("returning kiosk to player", { playerUrl: options.playerUrl });

      try {
        await navigateAndWait(connection, options.playerUrl, options.timeoutMs);
        console.log("kiosk returned to player", { playerUrl: options.playerUrl });
      } catch (error) {
        console.error("failed to return kiosk to player", error);
        process.exitCode = 1;
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
    console.warn("navigation did not report load before timeout", {
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

function parseOptions(args: string[]): BrowserRendererOptions {
  const [url, duration] = args;

  if (!url || url === "--help" || url === "-h") {
    printUsage();
    process.exit(url ? 0 : 1);
  }

  const options = {
    cdpHost: process.env.CHROMIUM_CDP_HOST ?? "127.0.0.1",
    cdpPort: Number(process.env.CHROMIUM_CDP_PORT ?? 9222),
    durationSeconds: Number(duration ?? process.env.BROWSER_RENDERER_DURATION_SECONDS ?? DEFAULT_DURATION_SECONDS),
    playerUrl: process.env.PLAYER_URL ?? DEFAULT_PLAYER_URL,
    timeoutMs: Number(process.env.BROWSER_RENDERER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    url
  };

  if (!Number.isInteger(options.cdpPort) || options.cdpPort <= 0) {
    throw new Error("CHROMIUM_CDP_PORT must be a positive integer");
  }

  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds <= 0) {
    throw new Error("Duration must be a positive number of seconds");
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("BROWSER_RENDERER_TIMEOUT_MS must be a positive number");
  }

  if (!isHttpUrl(options.playerUrl)) {
    throw new Error("PLAYER_URL must be an absolute http or https URL");
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  node dist/browserRenderer/testBrowserRenderer.js <url> [durationSeconds]

Environment:
  CHROMIUM_CDP_HOST                 default: 127.0.0.1
  CHROMIUM_CDP_PORT                 default: 9222
  PLAYER_URL                        default: ${DEFAULT_PLAYER_URL}
  BROWSER_RENDERER_TIMEOUT_MS       default: ${DEFAULT_TIMEOUT_MS}
  BROWSER_RENDERER_DURATION_SECONDS default: ${DEFAULT_DURATION_SECONDS}
`);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error("browser renderer test failed", error);
  process.exitCode = 1;
});
