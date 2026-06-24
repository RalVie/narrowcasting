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

export type ScheduleItem = TextScheduleItem | ImageScheduleItem;

export interface Schedule {
  version: number;
  updatedAt: string;
  items: ScheduleItem[];
}
