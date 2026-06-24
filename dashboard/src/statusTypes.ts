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
}

export interface PlayerCacheStatus {
  cachedFiles: number;
  files: Array<{
    filename: string;
    size: number;
  }>;
}
