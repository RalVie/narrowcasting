import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";

export interface PlaylistItem {
  id: string;
  mediaId: string;
  type: "image" | "video";
  file: string;
  duration: number;
  durationMode?: "auto" | "clip";
  startDate?: string;
  endDate?: string;
  daysOfWeek?: DayOfWeek[];
  startTime?: string;
  endTime?: string;
}

export interface Playlist {
  id?: string;
  name?: string;
  version: number;
  updatedAt: string;
  items: PlaylistItem[];
}

export interface PlaylistRecord extends Playlist {
  id: string;
  name: string;
}

const defaultPlaylistId = "default";
const playlistPath = resolve(process.cwd(), "data", "playlist.json");
const playlistsPath = resolve(process.cwd(), "data", "playlists.json");
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

function toPlaylistId(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `playlist-${Date.now()}`;
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
        duration: Math.max(Number(candidate.duration ?? 10), 1),
        durationMode:
          candidate.type === "video" && candidate.durationMode === "clip" ? "clip" : undefined
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

function normalizePlaylistRecord(value: unknown, fallbackIndex: number): PlaylistRecord | null {
  if (!isPlaylist(value)) {
    return null;
  }

  const candidate = value as Partial<PlaylistRecord>;
  const name =
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : fallbackIndex === 0
        ? "Default Playlist"
        : `Playlist ${fallbackIndex + 1}`;
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? toPlaylistId(candidate.id)
      : fallbackIndex === 0
        ? defaultPlaylistId
        : toPlaylistId(name);

  return {
    id,
    name,
    version: value.version,
    updatedAt: value.updatedAt,
    items: normalizePlaylistItems(value.items)
  };
}

async function writePlaylists(playlists: PlaylistRecord[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(playlistsPath, `${JSON.stringify(playlists, null, 2)}\n`, "utf8");

  const defaultPlaylist = playlists.find((playlist) => playlist.id === defaultPlaylistId);

  if (defaultPlaylist) {
    await writeFile(
      playlistPath,
      `${JSON.stringify(
        {
          version: defaultPlaylist.version,
          updatedAt: defaultPlaylist.updatedAt,
          items: defaultPlaylist.items
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }
}

export async function listPlaylists(): Promise<PlaylistRecord[]> {
  try {
    const content = await readFile(playlistsPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      const playlists = value
        .map((item, index) => normalizePlaylistRecord(item, index))
        .filter((item): item is PlaylistRecord => item !== null);

      if (playlists.length > 0) {
        return playlists;
      }
    }
  } catch {
    // Fall back to the Phase 4-8 single playlist file below.
  }

  const defaultPlaylist = await readPlaylist();

  if (!defaultPlaylist) {
    return [
      {
        id: defaultPlaylistId,
        name: "Default Playlist",
        version: 0,
        updatedAt: "",
        items: []
      }
    ];
  }

  return [
    {
      id: defaultPlaylistId,
      name: "Default Playlist",
      version: defaultPlaylist.version,
      updatedAt: defaultPlaylist.updatedAt,
      items: normalizePlaylistItems(defaultPlaylist.items)
    }
  ];
}

export async function savePlaylist(value: unknown): Promise<Playlist> {
  const playlists = await listPlaylists();
  const existingPlaylist = playlists.find((playlist) => playlist.id === defaultPlaylistId);
  const incoming = value as Partial<Playlist>;
  const playlist: PlaylistRecord = {
    id: defaultPlaylistId,
    name:
      typeof incoming.name === "string" && incoming.name.trim()
        ? incoming.name.trim()
        : existingPlaylist?.name ?? "Default Playlist",
    version: (existingPlaylist?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    items: normalizePlaylistItems(incoming.items)
  };

  const otherPlaylists = playlists.filter((item) => item.id !== defaultPlaylistId);
  await writePlaylists([playlist, ...otherPlaylists]);

  return {
    id: playlist.id,
    name: playlist.name,
    version: playlist.version,
    updatedAt: playlist.updatedAt,
    items: playlist.items
  };
}

export async function getPlaylistOrDefault(): Promise<Playlist> {
  const playlists = await listPlaylists();
  const playlist = playlists.find((item) => item.id === defaultPlaylistId);

  if (playlist) {
    return {
      id: playlist.id,
      name: playlist.name,
      version: playlist.version,
      updatedAt: playlist.updatedAt,
      items: playlist.items
    };
  }

  return {
    id: defaultPlaylistId,
    name: "Default Playlist",
    version: 0,
    updatedAt: "",
    items: []
  };
}

export async function createPlaylist(value: unknown): Promise<PlaylistRecord> {
  const playlists = await listPlaylists();
  const incoming = value as Partial<PlaylistRecord>;
  const name = typeof incoming.name === "string" && incoming.name.trim() ? incoming.name.trim() : "New Playlist";
  const baseId = toPlaylistId(typeof incoming.id === "string" ? incoming.id : name);
  const existingIds = new Set(playlists.map((playlist) => playlist.id));
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const playlist: PlaylistRecord = {
    id,
    name,
    version: 1,
    updatedAt: new Date().toISOString(),
    items: normalizePlaylistItems(incoming.items)
  };

  await writePlaylists([...playlists, playlist]);
  return playlist;
}

export async function savePlaylistRecord(id: string, value: unknown): Promise<PlaylistRecord | null> {
  const playlists = await listPlaylists();
  const existingPlaylist = playlists.find((playlist) => playlist.id === id);

  if (!existingPlaylist) {
    return null;
  }

  const incoming = value as Partial<PlaylistRecord>;
  const playlist: PlaylistRecord = {
    id: existingPlaylist.id,
    name:
      typeof incoming.name === "string" && incoming.name.trim()
        ? incoming.name.trim()
        : existingPlaylist.name,
    version: existingPlaylist.version + 1,
    updatedAt: new Date().toISOString(),
    items: normalizePlaylistItems(incoming.items)
  };

  await writePlaylists(playlists.map((item) => (item.id === id ? playlist : item)));
  return playlist;
}

export async function deletePlaylist(id: string): Promise<boolean> {
  if (id === defaultPlaylistId) {
    return false;
  }

  const playlists = await listPlaylists();
  const nextPlaylists = playlists.filter((playlist) => playlist.id !== id);

  if (nextPlaylists.length === playlists.length) {
    return false;
  }

  await writePlaylists(nextPlaylists);
  return true;
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
        duration: item.duration,
        durationMode: item.durationMode
      }))
  };
}
