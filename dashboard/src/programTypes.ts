export interface Program {
  id: string;
  name: string;
  playlistIds: string[];
  options?: Record<string, unknown>;
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export interface SchedulerBlock {
  id: string;
  programId: string;
  themeId?: string;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: DayOfWeek[];
  startTime?: string;
  endTime?: string;
  options?: Record<string, unknown>;
}

export interface SchedulerConfig {
  version: number;
  updatedAt: string;
  blocks: SchedulerBlock[];
}
