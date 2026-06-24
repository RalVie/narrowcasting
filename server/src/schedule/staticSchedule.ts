export interface ScheduleItem {
  id: string;
  type: "text";
  title: string;
  duration: number;
}

export interface Schedule {
  version: number;
  updatedAt: string;
  items: ScheduleItem[];
}

export const staticSchedule: Schedule = {
  version: 1,
  updatedAt: "2026-06-24T12:00:00Z",
  items: [
    {
      id: "welcome",
      type: "text",
      title: "Welcome to Narrowcasting",
      duration: 10
    },
    {
      id: "local-first",
      type: "text",
      title: "Playback continues from the local cache",
      duration: 8
    }
  ]
};
