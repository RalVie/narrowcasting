export interface PlaylistItem {
  id: string;
  mediaId: string;
  type: "image" | "video";
  file: string;
  duration: number;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: DayOfWeek[];
  startTime?: string;
  endTime?: string;
}

export interface Playlist {
  version: number;
  updatedAt: string;
  items: PlaylistItem[];
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";
