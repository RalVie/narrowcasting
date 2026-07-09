import { setTimeout as delay } from "node:timers/promises";
import { CdpConnection, listChromiumTargets, selectKioskTarget } from "./cdpClient.js";
import type { BrowserAction } from "../../../shared/runtime.js";

export interface BrowserRenderRequest {
  durationSeconds?: number;
  playbackMode?: "timed" | "persistent";
  playerUrl: string;
  url: string;
  browserActions?: BrowserAction[];
  signal?: AbortSignal;
  onStateChange?: (state: {
    currentTitle?: string | null;
    currentUrl?: string | null;
    navigationState?: "loading" | "loaded" | "failed" | null;
    status: "starting" | "active" | "returning" | "error";
  }) => void | Promise<void>;
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

  const playbackMode = request.playbackMode === "persistent" ? "persistent" : "timed";

  if (playbackMode === "timed" && (!Number.isFinite(request.durationSeconds) || Number(request.durationSeconds) <= 0)) {
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

    await request.onStateChange?.({
      currentUrl: request.url,
      navigationState: "loading",
      status: "starting"
    });
    console.log("browser renderer navigating to external URL", { url: request.url });
    await navigateAndWait(connection, request.url, options.timeoutMs);
    throwIfAborted(request.signal);
    await executeBrowserActions(connection, request.browserActions ?? [], options.timeoutMs, request.signal);
    const currentTitle = await readPageTitle(connection);

    console.log("browser renderer external URL active", {
      browserActions: request.browserActions?.length ?? 0,
      currentTitle,
      durationSeconds: playbackMode === "timed" ? request.durationSeconds : null,
      playbackMode,
      url: request.url
    });
    await request.onStateChange?.({
      currentTitle,
      currentUrl: request.url,
      navigationState: "loaded",
      status: "active"
    });
    if (playbackMode === "persistent") {
      console.log("browser renderer persistent session active until schedule changes", { url: request.url });
      await waitUntilCancelled(connection, request.browserActions ?? [], request.signal);
    } else {
      await waitWithRefresh(connection, request.browserActions ?? [], Number(request.durationSeconds) * 1000, request.signal);
    }
  } finally {
    if (connected) {
      await request.onStateChange?.({
        currentUrl: request.playerUrl,
        navigationState: "loading",
        status: "returning"
      });
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

async function readPageTitle(connection: CdpConnection): Promise<string | null> {
  try {
    const result = await connection.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: "document.title || null",
      returnByValue: true
    }) as { result?: { value?: unknown } };

    return typeof result.result?.value === "string" ? result.result.value : null;
  } catch {
    return null;
  }
}

async function waitUntilCancelled(connection: CdpConnection, actions: BrowserAction[], signal?: AbortSignal) {
  await waitWithRefresh(connection, actions, null, signal);
}

async function executeBrowserActions(
  connection: CdpConnection,
  actions: BrowserAction[],
  timeoutMs: number,
  signal?: AbortSignal
) {
  for (const [index, action] of actions.entries()) {
    throwIfAborted(signal);

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
        await abortableDelay(action.waitMs, signal);
      } else if (action.type === "click") {
        await clickSelector(connection, action.selector, action.timeoutMs ?? 5000, timeoutMs, signal);
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

async function waitWithRefresh(
  connection: CdpConnection,
  actions: BrowserAction[],
  durationMs: number | null,
  signal?: AbortSignal
) {
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
    if (durationMs === null) {
      while (true) {
        await abortableDelay(60_000, signal);
      }
    }

    await abortableDelay(durationMs, signal);
  } finally {
    for (const timer of timers) {
      clearInterval(timer);
    }
  }
}

async function clickSelector(
  connection: CdpConnection,
  selector: string,
  clickTimeoutMs: number,
  commandTimeoutMs: number,
  signal?: AbortSignal
) {
  const deadline = Date.now() + clickTimeoutMs;
  let lastSearchResult: ClickSearchResult | null = null;
  const contexts = await getClickSearchContexts(connection);
  const accessibleFrames = contexts.filter((context) => context.contextId !== null).length;
  const inaccessibleFrames = contexts.filter((context) => context.contextId === null && !context.isMain).length;

  console.log("browser automation click selector search started", {
    accessibleFrames,
    inaccessibleFrames,
    selector,
    searchedContexts: contexts.length,
    timeoutMs: clickTimeoutMs
  });

  while (Date.now() <= deadline) {
    throwIfAborted(signal);

    for (const context of contexts) {
      if (context.contextId === null && !context.isMain) {
        continue;
      }

      const result = await connection.send("Runtime.evaluate", {
        awaitPromise: true,
        ...(context.contextId === null ? {} : { contextId: context.contextId }),
        expression: buildClickSelectorExpression(selector),
        returnByValue: true
      }) as { result?: { value?: unknown } };

      const searchResult = isClickSearchResult(result.result?.value) ? result.result.value : null;
      lastSearchResult = normalizeFrameSearchResult(searchResult, context);

      if (lastSearchResult?.clicked) {
        console.log("browser automation click dispatched", {
          contextId: context.contextId,
          frameId: context.frameId,
          frameUrl: lastSearchResult.contextUrl ?? context.url,
          foundIn: lastSearchResult.foundIn,
          searchedContexts: contexts.length,
          selector,
          tagName: lastSearchResult.tagName,
          visible: lastSearchResult.visible,
          enabled: lastSearchResult.enabled
        });
        return;
      }
    }

    await abortableDelay(Math.min(500, Math.max(commandTimeoutMs, 1)), signal);
  }

  console.warn("browser automation click selector timed out", {
    lastResult: lastSearchResult,
    selector,
    timeoutMs: clickTimeoutMs
  });
  throw new Error(`Selector not found as visible/enabled before timeout: ${selector}`);
}

interface ClickSearchResult {
  clicked: boolean;
  contextUrl?: string | null;
  enabled: boolean | null;
  found: boolean;
  foundIn: "document" | "shadow" | "frame" | "shadow-frame" | null;
  tagName: string | null;
  visible: boolean | null;
}

interface ClickSearchContext {
  contextId: number | null;
  frameId: string | null;
  isMain: boolean;
  url: string | null;
}

function isClickSearchResult(value: unknown): value is ClickSearchResult {
  return Boolean(value && typeof value === "object" && "found" in value && "clicked" in value);
}

function buildClickSelectorExpression(selector: string) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || "1") !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function isEnabled(element) {
      return !(
        element.disabled === true ||
        element.getAttribute("aria-disabled") === "true" ||
        element.closest("[disabled],[aria-disabled='true']")
      );
    }

    function findMatchingElement(root, source) {
      const direct = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
      for (const element of direct) {
        if (isVisible(element) && isEnabled(element)) {
          return { element, source };
        }
      }

      const children = root.querySelectorAll ? Array.from(root.querySelectorAll("*")) : [];
      for (const child of children) {
        if (child.shadowRoot) {
          const match = findMatchingElement(child.shadowRoot, "shadow");
          if (match) {
            return match;
          }
        }
      }

      return null;
    }

    const match = findMatchingElement(document, "document");

    if (!match) {
      return {
        clicked: false,
        contextUrl: window.location.href,
        enabled: null,
        found: false,
        foundIn: null,
        tagName: null,
        visible: null
      };
    }

    const { element, source } = match;
    const visible = isVisible(element);
    const enabled = isEnabled(element);

    if (!visible || !enabled) {
      return {
        clicked: false,
        contextUrl: window.location.href,
        enabled,
        found: true,
        foundIn: source,
        tagName: element.tagName,
        visible
      };
    }

    element.scrollIntoView({ block: "center", inline: "center" });
    if (typeof element.click === "function") {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }

    return {
      clicked: true,
      contextUrl: window.location.href,
      enabled,
      found: true,
      foundIn: source,
      tagName: element.tagName,
      visible
    };
  })()`;
}

async function getClickSearchContexts(connection: CdpConnection): Promise<ClickSearchContext[]> {
  const contexts: ClickSearchContext[] = [
    {
      contextId: null,
      frameId: null,
      isMain: true,
      url: null
    }
  ];

  try {
    const frameTreeResponse = await connection.send("Page.getFrameTree") as { frameTree?: CdpFrameTree };
    const frames = flattenFrameTree(frameTreeResponse.frameTree);

    for (const [index, frame] of frames.entries()) {
      try {
        const contextResponse = await connection.send("Page.createIsolatedWorld", {
          frameId: frame.id,
          grantUniveralAccess: false,
          worldName: `narrowcasting-browser-automation-${index}`
        }) as { executionContextId?: unknown };

        if (typeof contextResponse.executionContextId === "number") {
          contexts.push({
            contextId: contextResponse.executionContextId,
            frameId: frame.id,
            isMain: index === 0,
            url: frame.url ?? null
          });
        }
      } catch (error) {
        contexts.push({
          contextId: null,
          frameId: frame.id,
          isMain: index === 0,
          url: frame.url ?? null
        });
        console.warn("browser automation frame context inaccessible", {
          error: error instanceof Error ? error.message : String(error),
          frameId: frame.id,
          frameUrl: frame.url ?? null
        });
      }
    }
  } catch (error) {
    console.warn("browser automation frame discovery failed; searching main context only", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return contexts;
}

interface CdpFrame {
  id: string;
  url?: string;
}

interface CdpFrameTree {
  childFrames?: CdpFrameTree[];
  frame?: CdpFrame;
}

function flattenFrameTree(frameTree: CdpFrameTree | undefined): CdpFrame[] {
  if (!frameTree?.frame) {
    return [];
  }

  return [
    frameTree.frame,
    ...(frameTree.childFrames ?? []).flatMap((childFrame) => flattenFrameTree(childFrame))
  ];
}

function normalizeFrameSearchResult(
  result: ClickSearchResult | null,
  context: ClickSearchContext
): ClickSearchResult | null {
  if (!result) {
    return null;
  }

  if (context.isMain || !result.foundIn) {
    return result;
  }

  return {
    ...result,
    foundIn: result.foundIn === "shadow" ? "shadow-frame" : "frame"
  };
}

function abortableDelay(ms: number, signal?: AbortSignal) {
  if (!signal) {
    return delay(ms);
  }

  return delay(ms, undefined, { signal });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("browser renderer cancelled");
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
