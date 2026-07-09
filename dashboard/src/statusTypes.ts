export interface SystemStatus {
  server: "online";
  scheduleVersion: number;
  playlistVersion: number | null;
  mediaCount: number;
}

export interface AgentStatus {
  lastSync: string | null;
  currentScheduleVersion: number | null;
  cachedFiles: number;
  syncStatus?: string | null;
  readinessState?: string | null;
  pendingScheduleVersion?: number | null;
  failedMedia?: Array<{
    file: string;
    error?: string;
  }>;
  lastError?: string | null;
  browserRenderer?: BrowserRendererRuntimeStatus | null;
}

export interface BrowserRendererRuntimeStatus {
  status: "idle" | "starting" | "active" | "returning" | "recovering" | "error";
  currentUrl: string | null;
  playbackMode: "timed" | "persistent" | null;
  runningSince: string | null;
  lastUpdatedAt: string | null;
  lastStopReason:
    | "schedule_changed"
    | "timed_playback_finished"
    | "watchdog_recovery"
    | "navigation_failed"
    | "manual_cancel"
    | "control_server_error"
    | null;
  currentTitle?: string | null;
  navigationState?: "loading" | "loaded" | "failed" | null;
  error?: string | null;
}

export interface PlayerCacheStatus {
  cachedFiles: number;
  files: Array<{
    filename: string;
    size: number;
  }>;
}
