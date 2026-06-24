import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";

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

const playlistPath = resolve(process.cwd(), "data", "playlist.json");
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const allowedDays = new Set<string>(dayNames);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

export type DayOfWeek = (typeof dayNames)[number];

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") {
    return false;
  }

  const playlist = value as Partial<Playlist>;

  return (
    typeof playlist.version === "number" &&
    typeof playlist.updatedAt === "string" &&
    Array.isArray(playlist.items)
  );
}

function normalizePlaylistItems(items: unknown): PlaylistItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index): PlaylistItem | null => {
      const candidate = item as Partial<PlaylistItem>;

      if (
        typeof candidate.mediaId !== "string" ||
        (candidate.type !== "image" && candidate.type !== "video") ||
        typeof candidate.file !== "string"
      ) {
        return null;
      }

      const playlistItem: PlaylistItem = {
        id: typeof candidate.id === "string" ? candidate.id : `item-${index + 1}`,
        mediaId: candidate.mediaId,
        type: candidate.type,
        file: candidate.file,
        duration: Math.max(Number(candidate.duration ?? 10), 1)
      };

      if (typeof candidate.startDate === "string" && datePattern.test(candidate.startDate)) {
        playlistItem.startDate = candidate.startDate;
      }

      if (typeof candidate.endDate === "string" && datePattern.test(candidate.endDate)) {
        playlistItem.endDate = candidate.endDate;
      }

      if (Array.isArray(candidate.daysOfWeek)) {
        const daysOfWeek = candidate.daysOfWeek.filter(
          (day): day is DayOfWeek => typeof day === "string" && allowedDays.has(day)
        );

        if (daysOfWeek.length > 0) {
          playlistItem.daysOfWeek = [...new Set(daysOfWeek)];
        }
      }

      if (typeof candidate.startTime === "string" && timePattern.test(candidate.startTime)) {
        playlistItem.startTime = candidate.startTime;
      }

      if (typeof candidate.endTime === "string" && timePattern.test(candidate.endTime)) {
        playlistItem.endTime = candidate.endTime;
      }

      return playlistItem;
    })
    .filter((item): item is PlaylistItem => item !== null);
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalTimeKey(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isPlaylistItemActive(item: PlaylistItem, now = new Date()) {
  const today = getLocalDateKey(now);
  const currentDay = dayNames[now.getDay()];
  const currentTime = getLocalTimeKey(now);

  if (item.startDate && today < item.startDate) {
    return false;
  }

  if (item.endDate && today > item.endDate) {
    return false;
  }

  if (item.daysOfWeek && item.daysOfWeek.length > 0 && !item.daysOfWeek.includes(currentDay)) {
    return false;
  }

  if (item.startTime && currentTime < item.startTime) {
    return false;
  }

  if (item.endTime && currentTime > item.endTime) {
    return false;
  }

  return true;
}

export async function readPlaylist(): Promise<Playlist | null> {
  try {
    const content = await readFile(playlistPath, "utf8");
    const value: unknown = JSON.parse(content);
    return isPlaylist(value) ? value : null;
  } catch {
    return null;
  }
}

export async function savePlaylist(value: unknown): Promise<Playlist> {
  const existingPlaylist = await readPlaylist();
  const incoming = value as Partial<Playlist>;
  const playlist: Playlist = {
    version: (existingPlaylist?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    items: normalizePlaylistItems(incoming.items)
  };

  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(playlistPath, `${JSON.stringify(playlist, null, 2)}\n`, "utf8");

  return playlist;
}

export async function getPlaylistOrDefault(): Promise<Playlist> {
  const playlist = await readPlaylist();

  if (playlist) {
    return playlist;
  }

  return {
    version: 0,
    updatedAt: "",
    items: []
  };
}

export async function getScheduleFromPlaylist(): Promise<Schedule> {
  const playlist = await readPlaylist();

  if (!playlist) {
    return staticSchedule;
  }

  return {
    version: playlist.version,
    updatedAt: playlist.updatedAt,
    items: playlist.items
      .filter((item) => isPlaylistItemActive(item))
      .map((item) => ({
        id: item.id,
        mediaId: item.mediaId,
        type: item.type,
        file: item.file,
        duration: item.duration
      }))
  };
}
