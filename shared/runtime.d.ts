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

export type ScheduleItem = TextScheduleItem | ImageScheduleItem | VideoScheduleItem;

export type ThemeOrientation = "landscape" | "portrait";
export type ThemeRegionType = "program" | "logo" | "image" | "text" | "clock";
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
  assignmentStatus?: "assigned" | "unassigned";
  assignedProgramId?: string | null;
  assignedProgramName?: string | null;
  theme?: Theme;
  items: ScheduleItem[];
}
