export interface ScreenRecord {
  screenId: string;
  playerId: string;
  name: string;
  status: "pending" | "approved";
  assignedProgramId?: string | null;
  assignedProgramName?: string | null;
  lastAssignment?: string | null;
  registeredAt: string;
  lastSeen: string;
  version: string;
  hostname: string;
  resolution: string;
  orientation: "landscape" | "portrait" | "unknown";
  userAgent: string;
  heartbeat?: ScreenHeartbeat;
  connectionStatus?: "online" | "offline";
  healthStatus?: "healthy" | "warning" | "offline";
  heartbeatAgeSeconds?: number | null;
}

export interface ScreenHeartbeat {
  screenId: string;
  playerId: string;
  hostname: string | null;
  softwareVersion: string | null;
  uptime: number | null;
  currentTime: string | null;
  lastSeen: string;
  currentProgram: string | null;
  currentPlaylist: string | null;
  currentMedia: string | null;
  currentMediaType: string | null;
  playState: string | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskFree: number | null;
  networkIp: string | null;
  resolution: string | null;
  orientation: "landscape" | "portrait" | "unknown";
  syncStatus: string | null;
  lastScheduleSync: string | null;
  lastScheduleSignature: string | null;
  playbackError?: string | null;
}
