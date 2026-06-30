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
}

export interface PlayerCacheStatus {
  cachedFiles: number;
  files: Array<{
    filename: string;
    size: number;
  }>;
}
