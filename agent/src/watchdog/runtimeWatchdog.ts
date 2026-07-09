import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  readBrowserRendererStatus,
  writeBrowserRendererStatus
} from "../browserRenderer/browserRendererStatus.js";
import { isBrowserRendererActive } from "../browserRenderer/controlServer.js";
import {
  CdpConnection,
  listChromiumTargets,
  selectKioskTarget,
  type ChromiumTarget
} from "../browserRenderer/cdpClient.js";
import type { AgentConfig } from "../config/loadAgentConfig.js";

interface WatchdogStatus {
  lastCheckAt: string;
  lastSuccessfulHealthCheck: string | null;
  lastRecovery: {
    at: string;
    action: string;
    reason: string;
  } | null;
  recoveryCount: number;
  state: "healthy" | "recovering" | "warning" | "failed";
  message: string;
}

interface CdpHealth {
  reachable: boolean;
  target: ChromiumTarget | null;
  targets: ChromiumTarget[];
  error?: string;
}

interface PlayerFunctionalHealth {
  blankSuspected: boolean;
  bodyChildCount: number;
  bodyTextLength: number;
  documentReadyState: string | null;
  errorText: string | null;
  hasMediaLikeElement: boolean;
  playerHealth: {
    activeIndex?: number;
    assignmentStatus?: string | null;
    itemCount?: number;
    lastRenderAt?: number;
    lastRenderIso?: string;
    scheduleVersion?: number | null;
    state?: string;
  } | null;
  playerHealthAgeMs: number | null;
  rootChildCount: number;
  rootPresent: boolean;
  url: string | null;
}

const recoveryState = {
  chromiumRestartTimes: [] as number[],
  consecutiveFunctionalFailures: 0,
  recoveryCount: 0,
  failedRecoveryCount: 0,
  lastRecovery: null as WatchdogStatus["lastRecovery"],
  lastSuccessfulHealthCheck: null as string | null
};

const functionalFailureThreshold = 2;

function timestamp() {
  return new Date().toISOString();
}

function isLinux() {
  return process.platform === "linux";
}

function isPlayerUrl(currentUrl: string | undefined, playerUrl: string) {
  if (!currentUrl) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    const expected = new URL(playerUrl);
    const currentHost = current.hostname === "127.0.0.1" ? "localhost" : current.hostname;
    const expectedHost = expected.hostname === "127.0.0.1" ? "localhost" : expected.hostname;

    return (
      current.protocol === expected.protocol &&
      currentHost === expectedHost &&
      current.port === expected.port &&
      current.pathname.replace(/\/$/, "") === expected.pathname.replace(/\/$/, "")
    );
  } catch {
    return currentUrl === playerUrl;
  }
}

function pruneWindow(values: number[], windowMs: number) {
  const cutoff = Date.now() - windowMs;
  return values.filter((value) => value >= cutoff);
}

async function writeStatus(config: AgentConfig, status: WatchdogStatus) {
  try {
    await mkdir(dirname(config.runtimeWatchdogStatusPath), { recursive: true });
    await writeFile(config.runtimeWatchdogStatusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("runtime watchdog status write failed", {
      error: error instanceof Error ? error.message : String(error),
      path: config.runtimeWatchdogStatusPath
    });
  }
}

function commandTimeoutMs() {
  return 10_000;
}

function runCommand(
  command: string,
  args: string[],
  label: string,
  options: { logFailure?: boolean; logSuccess?: boolean } = {}
): Promise<boolean> {
  const logFailure = options.logFailure ?? true;
  const logSuccess = options.logSuccess ?? true;

  return new Promise((resolve) => {
    const child = execFile(command, args, { timeout: commandTimeoutMs() }, (error, stdout, stderr) => {
      if (error) {
        if (logFailure) {
          console.warn("runtime watchdog command failed", {
            command,
            args,
            error: error.message,
            label,
            stderr: stderr.trim()
          });
        }
        resolve(false);
        return;
      }

      if (logSuccess) {
        console.log("runtime watchdog command completed", {
          command,
          args,
          label,
          stdout: stdout.trim()
        });
      }
      resolve(true);
    });

    child.on("error", (error) => {
      if (logFailure) {
        console.warn("runtime watchdog command could not start", {
          command,
          args,
          error: error.message,
          label
        });
      }
      resolve(false);
    });
  });
}

async function isChromiumRunning() {
  if (!isLinux()) {
    return true;
  }

  return runCommand("pgrep", ["-f", "chromium|chromium-browser|google-chrome"], "check chromium process", {
    logFailure: false,
    logSuccess: false
  });
}

async function getCdpHealth(config: AgentConfig): Promise<CdpHealth> {
  try {
    const targets = await listChromiumTargets({
      host: config.chromiumCdpHost,
      port: config.chromiumCdpPort,
      timeoutMs: config.browserRendererTimeoutMs
    });

    return {
      reachable: true,
      target: selectKioskTarget(targets, config.runtimeWatchdogPlayerUrl),
      targets
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      target: null,
      targets: []
    };
  }
}

async function isPlayerServerReachable(config: AgentConfig) {
  try {
    const response = await fetch(config.runtimeWatchdogPlayerUrl, {
      signal: AbortSignal.timeout(5_000)
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function navigateTargetToPlayer(config: AgentConfig, target: ChromiumTarget | null, reason: string) {
  if (!target?.webSocketDebuggerUrl) {
    console.warn("runtime watchdog cannot navigate: no CDP target", { reason });
    return false;
  }

  const connection = new CdpConnection({
    host: config.chromiumCdpHost,
    port: config.chromiumCdpPort,
    timeoutMs: config.browserRendererTimeoutMs
  });

  try {
    await connection.connect(target.webSocketDebuggerUrl);
    await connection.send("Page.enable");
    await connection.send("Page.navigate", { url: config.runtimeWatchdogPlayerUrl });
    console.warn("runtime watchdog returned Chromium to Player", {
      from: target.url,
      playerUrl: config.runtimeWatchdogPlayerUrl,
      reason
    });
    return true;
  } catch (error) {
    console.warn("runtime watchdog failed to return Chromium to Player", {
      error: error instanceof Error ? error.message : String(error),
      reason
    });
    return false;
  } finally {
    connection.close();
  }
}

function isCdpEvaluateResult(value: unknown): value is { result?: { value?: unknown } } {
  return Boolean(value && typeof value === "object" && "result" in value);
}

function isPlayerFunctionalHealth(value: unknown): value is PlayerFunctionalHealth {
  return Boolean(value && typeof value === "object");
}

async function getFunctionalHealth(config: AgentConfig, target: ChromiumTarget | null) {
  if (!target?.webSocketDebuggerUrl) {
    return null;
  }

  const connection = new CdpConnection({
    host: config.chromiumCdpHost,
    port: config.chromiumCdpPort,
    timeoutMs: config.browserRendererTimeoutMs
  });

  try {
    await connection.connect(target.webSocketDebuggerUrl);
    const result = await connection.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: `(() => {
        const root = document.getElementById("root");
        const body = document.body;
        const playerHealth = window.__narrowcastingPlayerHealth || null;
        const now = Date.now();
        const bodyTextLength = (body?.innerText || body?.textContent || "").trim().length;
        const bodyChildCount = body?.children?.length || 0;
        const rootChildCount = root?.children?.length || 0;
        const hasMediaLikeElement = Boolean(document.querySelector("video,img,iframe,canvas,article,.playback-surface,.web-url-frame,.rss-card"));
        const errorText = document.querySelector("vite-error-overlay, react-error-overlay, [data-runtime-error]")?.textContent || null;
        const readyState = document.readyState || null;
        const playerHealthAgeMs = playerHealth?.lastRenderAt ? now - playerHealth.lastRenderAt : null;
        const blankSuspected =
          readyState === "complete" &&
          (
            !body ||
            bodyChildCount === 0 ||
            !root ||
            rootChildCount === 0 ||
            (!hasMediaLikeElement && bodyTextLength === 0)
          );

        return {
          blankSuspected,
          bodyChildCount,
          bodyTextLength,
          documentReadyState: readyState,
          errorText,
          hasMediaLikeElement,
          playerHealth,
          playerHealthAgeMs,
          rootChildCount,
          rootPresent: Boolean(root),
          url: window.location.href
        };
      })()`,
      returnByValue: true
    });

    if (!isCdpEvaluateResult(result)) {
      return null;
    }

    const value = result.result?.value;
    return isPlayerFunctionalHealth(value) ? value : null;
  } catch (error) {
    console.warn("runtime watchdog functional health check failed", {
      error: error instanceof Error ? error.message : String(error),
      targetUrl: target.url ?? null
    });
    return null;
  } finally {
    connection.close();
  }
}

function functionalFailureReason(health: PlayerFunctionalHealth | null, playerExpected: boolean) {
  if (!health) {
    return "Player functional health could not be read through CDP.";
  }

  if (playerExpected && health.errorText) {
    return "Player page reports a runtime error overlay.";
  }

  if (playerExpected && health.blankSuspected) {
    return "Chromium appears to be rendering a blank Player page.";
  }

  if (playerExpected && !health.rootPresent) {
    return "Player root element is missing.";
  }

  if (playerExpected && health.rootChildCount === 0) {
    return "Player root element is empty.";
  }

  if (playerExpected && !health.playerHealth) {
    return "Player runtime health marker is missing.";
  }

  if (playerExpected && typeof health.playerHealthAgeMs === "number" && health.playerHealthAgeMs > 120_000) {
    return "Player runtime health marker is stale.";
  }

  return null;
}

async function restartService(serviceName: string, label: string) {
  if (!isLinux()) {
    console.warn("runtime watchdog service restart skipped outside Linux", { label, serviceName });
    return false;
  }

  const unit = `${serviceName}.service`;
  const direct = await runCommand("systemctl", ["restart", unit], label);

  if (direct) {
    return true;
  }

  return runCommand("sudo", ["-n", "systemctl", "restart", unit], label);
}

async function systemdServiceExists(serviceName: string) {
  if (!isLinux()) {
    return false;
  }

  return runCommand("systemctl", ["cat", `${serviceName}.service`], `check ${serviceName} service`, {
    logFailure: false,
    logSuccess: false
  });
}

async function restartChromium(config: AgentConfig, reason: string) {
  recoveryState.chromiumRestartTimes = pruneWindow(
    recoveryState.chromiumRestartTimes,
    config.runtimeWatchdogWindowMs
  );

  if (recoveryState.chromiumRestartTimes.length >= config.runtimeWatchdogMaxChromiumRestarts) {
    console.warn("runtime watchdog chromium restart limit reached", {
      maxRestarts: config.runtimeWatchdogMaxChromiumRestarts,
      reason,
      windowMs: config.runtimeWatchdogWindowMs
    });
    return false;
  }

  recoveryState.chromiumRestartTimes.push(Date.now());
  console.warn("runtime watchdog restarting Chromium", { reason });

  if (isLinux()) {
    await runCommand("pkill", ["-f", "chromium|chromium-browser|google-chrome"], "restart chromium", {
      logFailure: false
    });
  }

  if (await systemdServiceExists(config.narrowcastingKioskService)) {
    await restartService(config.narrowcastingKioskService, "restart kiosk service");
  } else {
    console.warn("runtime watchdog kiosk service restart skipped because service is not installed", {
      serviceName: config.narrowcastingKioskService
    });
  }
  await delay(8_000);

  const cdp = await getCdpHealth(config);
  return cdp.reachable;
}

async function restartPlayerService(config: AgentConfig, reason: string) {
  console.warn("runtime watchdog escalated to player service restart", { reason });
  const restarted = await restartService(config.narrowcastingPlayerService, "restart player service");
  await delay(6_000);
  return restarted && (await isPlayerServerReachable(config));
}

async function restartAgentService(config: AgentConfig, reason: string) {
  console.error("runtime watchdog escalated to agent service restart", { reason });
  return restartService(config.narrowcastingAgentService, "restart agent service");
}

async function maybeReboot(config: AgentConfig, reason: string) {
  if (!config.runtimeWatchdogAllowReboot) {
    console.error("runtime watchdog reboot escalation skipped because reboot is disabled", { reason });
    return false;
  }

  if (recoveryState.failedRecoveryCount < config.runtimeWatchdogRebootAfterFailures) {
    console.error("runtime watchdog reboot escalation not yet allowed", {
      failedRecoveryCount: recoveryState.failedRecoveryCount,
      reason,
      requiredFailures: config.runtimeWatchdogRebootAfterFailures
    });
    return false;
  }

  console.error("runtime watchdog escalated to reboot", { reason });
  return runCommand("sudo", ["-n", "reboot"], "runtime watchdog reboot");
}

async function recordRecovery(config: AgentConfig, action: string, reason: string, state: WatchdogStatus["state"]) {
  recoveryState.recoveryCount += 1;
  recoveryState.lastRecovery = {
    action,
    at: timestamp(),
    reason
  };

  await writeStatus(config, {
    lastCheckAt: timestamp(),
    lastRecovery: recoveryState.lastRecovery,
    lastSuccessfulHealthCheck: recoveryState.lastSuccessfulHealthCheck,
    message: reason,
    recoveryCount: recoveryState.recoveryCount,
    state
  });
}

async function recoverRuntime(
  config: AgentConfig,
  reason: string,
  cdp: CdpHealth,
  options: { skipNavigate?: boolean } = {}
) {
  await recordRecovery(config, "recovery_started", reason, "recovering");

  if (!options.skipNavigate && cdp.reachable && cdp.target) {
    const navigated = await navigateTargetToPlayer(config, cdp.target, reason);

    if (navigated) {
      await recordRecovery(config, "returned_to_player", reason, "healthy");
      recoveryState.failedRecoveryCount = 0;
      console.warn("runtime watchdog recovery complete: returned to Player", { reason });
      return;
    }
  }

  if (await restartChromium(config, reason)) {
    await recordRecovery(config, "chromium_restarted", reason, "healthy");
    recoveryState.failedRecoveryCount = 0;
    console.warn("runtime watchdog recovery complete: Chromium restarted", { reason });
    return;
  }

  if (await restartPlayerService(config, reason)) {
    await recordRecovery(config, "player_service_restarted", reason, "healthy");
    recoveryState.failedRecoveryCount = 0;
    console.warn("runtime watchdog recovery complete: player service restarted", { reason });
    return;
  }

  recoveryState.failedRecoveryCount += 1;

  if (await restartAgentService(config, reason)) {
    await recordRecovery(config, "agent_service_restarted", reason, "warning");
    return;
  }

  await maybeReboot(config, reason);
  await recordRecovery(config, "recovery_failed", reason, "failed");
}

async function recordBrowserRendererRecovery(config: AgentConfig, reason: string) {
  try {
    const currentStatus = await readBrowserRendererStatus(config);
    await writeBrowserRendererStatus(config, {
      ...currentStatus,
      status: "recovering",
      lastUpdatedAt: timestamp(),
      lastStopReason: "watchdog_recovery",
      error: reason
    });
  } catch (error) {
    console.warn("runtime watchdog could not write Browser Renderer recovery status", {
      error: error instanceof Error ? error.message : String(error),
      reason
    });
  }
}

async function healthCheck(config: AgentConfig) {
  const now = timestamp();
  const browserRendererActive = isBrowserRendererActive();
  const chromiumRunning = await isChromiumRunning();
  const cdp = await getCdpHealth(config);

  if (!chromiumRunning) {
    console.warn("runtime watchdog detected Chromium not running", { at: now });
    if (browserRendererActive) {
      await recordBrowserRendererRecovery(config, "Chromium is not running.");
    }
    await recoverRuntime(config, "Chromium is not running.", cdp, { skipNavigate: true });
    return;
  }

  if (!cdp.reachable) {
    console.warn("runtime watchdog detected CDP unavailable", {
      at: now,
      error: cdp.error
    });
    if (browserRendererActive) {
      await recordBrowserRendererRecovery(config, "Chromium DevTools Protocol is unavailable.");
    }
    await recoverRuntime(config, "Chromium DevTools Protocol is unavailable.", cdp, { skipNavigate: true });
    return;
  }

  if (browserRendererActive) {
    const functionalHealth = await getFunctionalHealth(config, cdp.target);
    const reason = functionalFailureReason(functionalHealth, false);

    if (reason) {
      recoveryState.consecutiveFunctionalFailures += 1;
      console.warn("runtime watchdog detected Browser Renderer functional health issue", {
        at: now,
        consecutiveFailures: recoveryState.consecutiveFunctionalFailures,
        currentUrl: cdp.target?.url ?? null,
        documentReadyState: functionalHealth?.documentReadyState ?? null,
        reason
      });

      if (recoveryState.consecutiveFunctionalFailures >= functionalFailureThreshold) {
        await recordBrowserRendererRecovery(config, reason);
        await recoverRuntime(config, reason, cdp);
        return;
      }

      await writeStatus(config, {
        lastCheckAt: now,
        lastRecovery: recoveryState.lastRecovery,
        lastSuccessfulHealthCheck: recoveryState.lastSuccessfulHealthCheck,
        message: reason,
        recoveryCount: recoveryState.recoveryCount,
        state: "warning"
      });
      return;
    }

    recoveryState.consecutiveFunctionalFailures = 0;
    recoveryState.lastSuccessfulHealthCheck = now;
    await writeStatus(config, {
      lastCheckAt: now,
      lastRecovery: recoveryState.lastRecovery,
      lastSuccessfulHealthCheck: now,
      message: "Browser renderer active; CDP healthy.",
      recoveryCount: recoveryState.recoveryCount,
      state: "healthy"
    });
    return;
  }

  const playerReachable = await isPlayerServerReachable(config);

  if (!playerReachable) {
    console.warn("runtime watchdog detected Player server unavailable", {
      at: now,
      playerUrl: config.runtimeWatchdogPlayerUrl
    });
    await recoverRuntime(config, "Player static server is unavailable.", cdp, { skipNavigate: true });
    return;
  }

  if (!isPlayerUrl(cdp.target?.url, config.runtimeWatchdogPlayerUrl)) {
    console.warn("runtime watchdog detected Chromium away from Player", {
      at: now,
      currentUrl: cdp.target?.url ?? null,
      playerUrl: config.runtimeWatchdogPlayerUrl
    });
    await recoverRuntime(config, "Chromium is not displaying the Player URL.", cdp);
    return;
  }

  const functionalHealth = await getFunctionalHealth(config, cdp.target);
  const functionalReason = functionalFailureReason(functionalHealth, true);

  if (functionalReason) {
    recoveryState.consecutiveFunctionalFailures += 1;
    console.warn("runtime watchdog detected Player functional health issue", {
      at: now,
      activeUrl: cdp.target?.url ?? null,
      consecutiveFailures: recoveryState.consecutiveFunctionalFailures,
      documentReadyState: functionalHealth?.documentReadyState ?? null,
      playerHealthAgeMs: functionalHealth?.playerHealthAgeMs ?? null,
      reason: functionalReason,
      rootPresent: functionalHealth?.rootPresent ?? null
    });

    if (recoveryState.consecutiveFunctionalFailures >= functionalFailureThreshold) {
      await recoverRuntime(config, functionalReason, cdp);
      return;
    }

    await writeStatus(config, {
      lastCheckAt: now,
      lastRecovery: recoveryState.lastRecovery,
      lastSuccessfulHealthCheck: recoveryState.lastSuccessfulHealthCheck,
      message: functionalReason,
      recoveryCount: recoveryState.recoveryCount,
      state: "warning"
    });
    return;
  }

  recoveryState.consecutiveFunctionalFailures = 0;
  recoveryState.lastSuccessfulHealthCheck = now;
  recoveryState.failedRecoveryCount = 0;
  await writeStatus(config, {
    lastCheckAt: now,
    lastRecovery: recoveryState.lastRecovery,
    lastSuccessfulHealthCheck: now,
    message: "Chromium, CDP, Player URL, and Player runtime are healthy.",
    recoveryCount: recoveryState.recoveryCount,
    state: "healthy"
  });
}

export function startRuntimeWatchdog(config: AgentConfig) {
  if (!config.runtimeWatchdogEnabled) {
    console.log("runtime watchdog disabled");
    return;
  }

  console.log("runtime watchdog ready", {
    allowReboot: config.runtimeWatchdogAllowReboot,
    cdp: `${config.chromiumCdpHost}:${config.chromiumCdpPort}`,
    intervalMs: config.runtimeWatchdogIntervalMs,
    playerUrl: config.runtimeWatchdogPlayerUrl,
    statusPath: config.runtimeWatchdogStatusPath
  });

  const run = async () => {
    try {
      await healthCheck(config);
    } catch (error) {
      console.error("runtime watchdog check failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, config.runtimeWatchdogIntervalMs);
}
