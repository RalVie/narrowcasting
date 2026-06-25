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
}

export type ScheduleItem = TextScheduleItem | ImageScheduleItem | VideoScheduleItem;

export interface ThemeRegion {
  id: string;
  name: string;
  type: "program" | "image" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Theme {
  id: string;
  name: string;
  orientation: "landscape" | "portrait";
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundMediaId?: string;
  regions: ThemeRegion[];
}

export interface Schedule {
  version: number;
  updatedAt: string;
  theme?: Theme;
  items: ScheduleItem[];
}

export const staticSchedule: Schedule = {
  version: 2,
  updatedAt: "2026-06-24T12:00:00Z",
  items: [
    {
      id: "welcome-image",
      type: "image",
      file: "welcome.jpg",
      duration: 10
    }
  ]
};
