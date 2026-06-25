import { listPlaylists, getScheduleFromPlaylist } from "../playlist/playlistStore.js";
import { getProgramsOrDefault } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { getThemeOrDefault } from "../theme/themeStore.js";
import { isSchedulerBlockActive, readScheduler } from "./schedulerStore.js";

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
      duration: item.duration
    }));
  });

  return {
    version: scheduler.version,
    updatedAt: scheduler.updatedAt || staticSchedule.updatedAt,
    theme,
    items
  };
}
