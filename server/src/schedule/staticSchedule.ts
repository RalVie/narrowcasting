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
