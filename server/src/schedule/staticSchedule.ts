import type {
  ImageScheduleItem,
  ResolvedSchedule,
  RssScheduleItem,
  ScheduleItem,
  TextScheduleItem,
  Theme,
  ThemeRegion,
  VideoScheduleItem,
  WebUrlScheduleItem
} from "../../../shared/runtime.js";

export type {
  ImageScheduleItem,
  RssScheduleItem,
  ScheduleItem,
  TextScheduleItem,
  Theme,
  ThemeRegion,
  VideoScheduleItem,
  WebUrlScheduleItem
};

export type Schedule = ResolvedSchedule;

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
