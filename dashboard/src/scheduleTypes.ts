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

export interface Schedule {
  version: number;
  updatedAt: string;
  items: ScheduleItem[];
}
