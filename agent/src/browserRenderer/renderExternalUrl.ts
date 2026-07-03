import { setTimeout as delay } from "node:timers/promises";
import { CdpConnection, listChromiumTargets, selectKioskTarget } from "./cdpClient.js";
import type { BrowserAction } from "../../../shared/runtime.js";

export interface BrowserRenderRequest {
  durationSeconds: number;
  playerUrl: string;
  url: string;
  browserActions?: BrowserAction[];
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
    await executeBrowserActions(connection, request.browserActions ?? [], options.timeoutMs);

    console.log("browser renderer external URL active", {
      browserActions: request.browserActions?.length ?? 0,
      durationSeconds: request.durationSeconds,
      url: request.url
    });
    await waitWithRefresh(connection, request.browserActions ?? [], request.durationSeconds * 1000);
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

async function executeBrowserActions(connection: CdpConnection, actions: BrowserAction[], timeoutMs: number) {
  for (const [index, action] of actions.entries()) {
    if (action.type === "refresh_interval") {
      console.log("browser automation refresh interval armed", {
        actionIndex: index,
        intervalSeconds: action.intervalSeconds
      });
      continue;
    }

    console.log("browser automation action started", { actionIndex: index, action });

    try {
      if (action.type === "wait") {
        await delay(action.waitMs);
      } else if (action.type === "click") {
        await clickSelector(connection, action.selector, action.timeoutMs ?? 5000, timeoutMs);
      }

      console.log("browser automation action completed", { actionIndex: index, type: action.type });
    } catch (error) {
      console.warn("browser automation action failed", {
        actionIndex: index,
        error: error instanceof Error ? error.message : String(error),
        type: action.type
      });
    }
  }
}

async function waitWithRefresh(connection: CdpConnection, actions: BrowserAction[], durationMs: number) {
  const refreshActions = actions.filter((action): action is Extract<BrowserAction, { type: "refresh_interval" }> =>
    action.type === "refresh_interval"
  );
  const timers = refreshActions.map((action) =>
    setInterval(() => {
      connection
        .send("Page.reload", { ignoreCache: false })
        .then(() => {
          console.log("browser automation refresh completed", {
            intervalSeconds: action.intervalSeconds
          });
        })
        .catch((error: unknown) => {
          console.warn("browser automation refresh failed", {
            error: error instanceof Error ? error.message : String(error),
            intervalSeconds: action.intervalSeconds
          });
        });
    }, action.intervalSeconds * 1000)
  );

  try {
    await delay(durationMs);
  } finally {
    for (const timer of timers) {
      clearInterval(timer);
    }
  }
}

async function clickSelector(connection: CdpConnection, selector: string, clickTimeoutMs: number, commandTimeoutMs: number) {
  const deadline = Date.now() + clickTimeoutMs;

  while (Date.now() <= deadline) {
    const result = await connection.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) {
          return false;
        }

        if (typeof element.click === "function") {
          element.click();
          return true;
        }

        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      })()`,
      returnByValue: true
    }) as { result?: { value?: unknown } };

    if (result.result?.value === true) {
      return;
    }

    await delay(Math.min(500, Math.max(commandTimeoutMs, 1)));
  }

  throw new Error(`Selector not found before timeout: ${selector}`);
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
