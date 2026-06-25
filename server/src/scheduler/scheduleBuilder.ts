import { listPlaylists } from "../playlist/playlistStore.js";
import type { Program } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { getThemeOrDefault } from "../theme/themeStore.js";

export function hashScheduleVersion(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function getLatestUpdatedAt(values: string[]) {
  const latestTime = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .reduce((latest, value) => Math.max(latest, value), 0);

  return latestTime > 0 ? new Date(latestTime).toISOString() : staticSchedule.updatedAt;
}

export async function getScheduleForProgram(program: Program, themeId?: string): Promise<Schedule> {
  const [playlists, theme] = await Promise.all([
    listPlaylists(),
    getThemeOrDefault(themeId)
  ]);
  const items = program.playlistIds.flatMap((playlistId) => {
    const playlist = playlists.find((candidate) => candidate.id === playlistId);

    if (!playlist) {
      return [];
    }

    return playlist.items.map((item) => ({
      id: `${program.id}-${playlist.id}-${item.id}`,
      mediaId: item.mediaId,
      type: item.type,
      file: item.file,
      duration: item.duration,
      durationMode: item.durationMode
    }));
  });
  const activePlaylists = program.playlistIds
    .map((playlistId) => playlists.find((candidate) => candidate.id === playlistId))
    .filter((playlist) => playlist !== undefined);
  const scheduleContent = {
    program,
    playlistVersions: activePlaylists.map((playlist) => ({
      id: playlist.id,
      version: playlist.version,
      updatedAt: playlist.updatedAt
    })),
    theme,
    items
  };

  return {
    version: hashScheduleVersion(scheduleContent),
    updatedAt: getLatestUpdatedAt(activePlaylists.map((playlist) => playlist.updatedAt)),
    assignmentStatus: "assigned",
    assignedProgramId: program.id,
    assignedProgramName: program.name,
    theme,
    items
  };
}
