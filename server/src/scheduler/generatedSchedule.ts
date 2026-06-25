import { listPlaylists, getScheduleFromPlaylist } from "../playlist/playlistStore.js";
import { getProgramsOrDefault } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { getThemeOrDefault } from "../theme/themeStore.js";
import { isSchedulerBlockActive, readScheduler } from "./schedulerStore.js";

function hashScheduleVersion(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getLatestUpdatedAt(values: string[]) {
  const latestTime = values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .reduce((latest, value) => Math.max(latest, value), 0);

  return latestTime > 0 ? new Date(latestTime).toISOString() : staticSchedule.updatedAt;
}

export async function getGeneratedSchedule(): Promise<Schedule> {
  const scheduler = await readScheduler();

  if (scheduler.blocks.length === 0) {
    return getScheduleFromPlaylist();
  }

  const activeBlock = scheduler.blocks.find((block) => isSchedulerBlockActive(block));

  if (!activeBlock) {
    return {
      version: scheduler.version,
      updatedAt: scheduler.updatedAt,
      theme: await getThemeOrDefault(),
      items: []
    };
  }

  const [programs, playlists, theme] = await Promise.all([
    getProgramsOrDefault(),
    listPlaylists(),
    getThemeOrDefault(activeBlock.themeId)
  ]);
  const activeProgram = programs.find((program) => program.id === activeBlock.programId);

  if (!activeProgram) {
    return {
      version: scheduler.version,
      updatedAt: scheduler.updatedAt,
      theme,
      items: []
    };
  }

  const items = activeProgram.playlistIds.flatMap((playlistId) => {
    const playlist = playlists.find((candidate) => candidate.id === playlistId);

    if (!playlist) {
      return [];
    }

    return playlist.items.map((item) => ({
      id: `${activeProgram.id}-${playlist.id}-${item.id}`,
      mediaId: item.mediaId,
      type: item.type,
      file: item.file,
      duration: item.duration,
      durationMode: item.durationMode
    }));
  });
  const activePlaylists = activeProgram.playlistIds
    .map((playlistId) => playlists.find((candidate) => candidate.id === playlistId))
    .filter((playlist) => playlist !== undefined);
  const scheduleContent = {
    schedulerVersion: scheduler.version,
    schedulerUpdatedAt: scheduler.updatedAt,
    activeBlock,
    activeProgram,
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
    updatedAt: getLatestUpdatedAt([
      scheduler.updatedAt,
      ...activePlaylists.map((playlist) => playlist.updatedAt)
    ]),
    theme,
    items
  };
}
