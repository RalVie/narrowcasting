import { listPlaylists, getScheduleFromPlaylist } from "../playlist/playlistStore.js";
import { getProgramsOrDefault, type Program } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { getScreenById } from "../screens/screenStore.js";
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

async function getScheduleForProgram(program: Program, themeId?: string): Promise<Schedule> {
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

export async function getGeneratedScheduleForScreen(screenId: string): Promise<Schedule> {
  const screen = await getScreenById(screenId);

  if (!screen || !screen.assignedProgramId) {
    const theme = await getThemeOrDefault();

    return {
      version: hashScheduleVersion({ screenId, assignmentStatus: "unassigned", theme }),
      updatedAt: screen?.lastAssignment ?? screen?.lastSeen ?? staticSchedule.updatedAt,
      assignmentStatus: "unassigned",
      assignedProgramId: null,
      assignedProgramName: null,
      theme,
      items: []
    };
  }

  const programs = await getProgramsOrDefault();
  const program = programs.find((item) => item.id === screen.assignedProgramId);

  if (!program) {
    const theme = await getThemeOrDefault();

    return {
      version: hashScheduleVersion({
        screenId,
        assignmentStatus: "unassigned",
        missingProgramId: screen.assignedProgramId,
        theme
      }),
      updatedAt: screen.lastAssignment ?? staticSchedule.updatedAt,
      assignmentStatus: "unassigned",
      assignedProgramId: screen.assignedProgramId,
      assignedProgramName: screen.assignedProgramName ?? null,
      theme,
      items: []
    };
  }

  return getScheduleForProgram(program);
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

  const [programs, theme] = await Promise.all([
    getProgramsOrDefault(),
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

  return getScheduleForProgram(activeProgram, activeBlock.themeId);
}
