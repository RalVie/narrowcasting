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
