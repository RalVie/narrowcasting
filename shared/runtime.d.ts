export interface TextScheduleItem {
  id: string;
  type: "text";
  title: string;
  duration: number;
}

export interface ImageScheduleItem {
  id: string;
  mediaId?: string;
  type: "image";
  file: string;
  duration: number;
}

export interface VideoScheduleItem {
  id: string;
  mediaId?: string;
  type: "video";
  file: string;
  duration?: number;
  durationMode?: "auto" | "clip";
}

export type BrowserAction =
  | {
      id?: string;
      type: "wait";
      waitMs: number;
    }
  | {
      id?: string;
      type: "click";
      selector: string;
      timeoutMs?: number;
    }
  | {
      id?: string;
      type: "refresh_interval";
      intervalSeconds: number;
    };

export interface WebUrlScheduleItem {
  id: string;
  mediaId?: string;
  type: "web_url";
  title?: string;
  url: string;
  duration?: number;
  playbackMode?: "timed" | "persistent";
  webUrlRenderMode?: "iframe" | "browser";
  browserActions?: BrowserAction[];
}

export interface RssStyle {
  backgroundColor?: string;
  textColor?: string;
  titleColor?: string;
  accentColor?: string;
  cardBackgroundColor?: string;
  titleSize?: "small" | "normal" | "large" | "extra-large";
  bodySize?: "small" | "normal" | "large" | "extra-large";
  metaSize?: "small" | "normal" | "large" | "extra-large";
}

export interface RssScheduleItem {
  id: string;
  mediaId?: string;
  type: "rss_item";
  title: string;
  summary?: string | null;
  link?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  sourceTitle?: string | null;
  rssStyle?: RssStyle;
  duration: number;
}

export type ScheduleItem =
  | TextScheduleItem
  | ImageScheduleItem
  | VideoScheduleItem
  | WebUrlScheduleItem
  | RssScheduleItem;

export type ThemeOrientation = "landscape" | "portrait";
export type ThemeRegionType = "program" | "logo" | "image" | "text" | "clock" | "rss";
export type ThemeObjectFit = "contain" | "cover" | "stretch" | "center";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeClockFormat = "HH:mm" | "HH:mm:ss" | "dd-MM-yyyy HH:mm";

export interface ThemeRegion {
  id: string;
  name: string;
  type: ThemeRegionType;
  x: number;
  y: number;
  width: number;
  height: number;
  mediaId?: string;
  file?: string;
  objectFit?: ThemeObjectFit;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  text?: string;
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: ThemeTextAlign;
  textColor?: string;
  backgroundColor?: string;
  padding?: number;
  cornerRadius?: number;
  clockFormat?: ThemeClockFormat;
}

export interface Theme {
  id: string;
  name: string;
  orientation: ThemeOrientation;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundMediaId?: string;
  regions: ThemeRegion[];
  options?: Record<string, unknown>;
}

export interface ResolvedSchedule {
  version: number;
  updatedAt: string;
  assignmentStatus?: "assigned" | "unassigned" | "decommissioned";
  assignedProgramId?: string | null;
  assignedProgramName?: string | null;
  theme?: Theme;
  items: ScheduleItem[];
}
