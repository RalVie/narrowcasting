export interface ScreenRecord {
  screenId: string;
  playerId: string;
  name: string;
  status: "pending" | "approved";
  lastSeen: string;
  version: string;
  hostname: string;
  resolution: string;
  orientation: "landscape" | "portrait" | "unknown";
  userAgent: string;
}
