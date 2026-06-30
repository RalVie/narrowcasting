import type {
  ImageScheduleItem,
  ResolvedSchedule,
  ScheduleItem,
  TextScheduleItem,
  Theme,
  ThemeRegion,
  VideoScheduleItem
} from "../../../shared/runtime.js";

export type {
  ImageScheduleItem,
  ScheduleItem,
  TextScheduleItem,
  Theme,
  ThemeRegion,
  VideoScheduleItem
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
