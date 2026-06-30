import { getScheduleFromPlaylist } from "../playlist/playlistStore.js";
import type { Schedule } from "../schedule/staticSchedule.js";
import { resolveScheduleForScreen } from "./schedulerResolver.js";

export async function getGeneratedScheduleForScreen(screenId: string): Promise<Schedule> {
  const resolution = await resolveScheduleForScreen(screenId);
  return resolution.schedule;
}

/**
 * Legacy diagnostic snapshot only.
 *
 * Production player schedules must use getGeneratedScheduleForScreen(), which
 * goes through Assignments -> Candidates -> Scheduler Resolver -> Resolved Schedule.
 * Legacy scheduler blocks are intentionally ignored here so this helper cannot
 * become a second runtime scheduler.
 */
export async function getLegacyGeneratedSchedule(): Promise<Schedule> {
  return getScheduleFromPlaylist();
}
