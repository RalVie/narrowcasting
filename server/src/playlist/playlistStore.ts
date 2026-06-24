import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";

export interface PlaylistItem {
  id: string;
  mediaId: string;
  type: "image";
  file: string;
  duration: number;
}

export interface Playlist {
  version: number;
  updatedAt: string;
  items: PlaylistItem[];
}

const playlistPath = resolve(process.cwd(), "data", "playlist.json");

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
        candidate.type !== "image" ||
        typeof candidate.file !== "string"
      ) {
        return null;
      }

      return {
        id: typeof candidate.id === "string" ? candidate.id : `item-${index + 1}`,
        mediaId: candidate.mediaId,
        type: "image",
        file: candidate.file,
        duration: Math.max(Number(candidate.duration ?? 10), 1)
      };
    })
    .filter((item): item is PlaylistItem => item !== null);
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

  if (!playlist || playlist.items.length === 0) {
    return staticSchedule;
  }

  return {
    version: playlist.version,
    updatedAt: playlist.updatedAt,
    items: playlist.items.map((item) => ({
      id: item.id,
      mediaId: item.mediaId,
      type: item.type,
      file: item.file,
      duration: item.duration
    }))
  };
}
