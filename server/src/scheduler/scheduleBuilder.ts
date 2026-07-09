import { listPlaylists } from "../playlist/playlistStore.js";
import { listMedia, resolveMediaReferenceFromList } from "../media/mediaStore.js";
import type { Program } from "../program/programStore.js";
import { staticSchedule, type Schedule } from "../schedule/staticSchedule.js";
import { getThemeOrDefault } from "../theme/themeStore.js";
import { fetchRssItems } from "../rss/rssFetcher.js";

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

function resolveScheduleMedia(
  mediaItems: Awaited<ReturnType<typeof listMedia>>,
  item: { mediaId?: string; file?: string }
) {
  const mediaById = resolveMediaReferenceFromList(mediaItems, item.mediaId);

  if (mediaById) {
    return mediaById;
  }

  const mediaByLegacyFile = resolveMediaReferenceFromList(mediaItems, item.file);

  if (mediaByLegacyFile) {
    console.warn("schedule item resolved through legacy file fallback", {
      mediaId: item.mediaId,
      file: item.file,
      resolvedMediaId: mediaByLegacyFile.mediaId
    });
  }

  return mediaByLegacyFile;
}

export async function getScheduleForProgram(program: Program, themeId?: string): Promise<Schedule> {
  const [playlists, theme, mediaItems] = await Promise.all([
    listPlaylists(),
    getThemeOrDefault(themeId),
    listMedia()
  ]);
  const items = (
    await Promise.all(program.playlistIds.map(async (playlistId) => {
    const playlist = playlists.find((candidate) => candidate.id === playlistId);

    if (!playlist) {
      return [];
    }

    const playlistItems = await Promise.all(
      playlist.items.map(async (item) => {
        const media = resolveScheduleMedia(mediaItems, item);
        const baseId = `${program.id}-${playlist.id}-${item.id}`;

        if (item.type === "web_url") {
          const url = media?.url;

          if (!url) {
            return [];
          }
          const playbackMode: "timed" | "persistent" = media.webUrlPlaybackMode === "persistent" ? "persistent" : "timed";

          return [
            {
              id: baseId,
              mediaId: item.mediaId,
              type: "web_url" as const,
              title: media.title,
              url,
              duration: playbackMode === "timed" ? item.duration : undefined,
              playbackMode,
              webUrlRenderMode: media.webUrlRenderMode ?? "iframe",
              browserActions: media.browserActions
            }
          ];
        }

        if (item.type === "rss_feed") {
          const url = media?.url;

          if (!url) {
            return [];
          }

          const feedItems = await fetchRssItems(url, media.maxItems ?? 5);
          if (feedItems.length === 0) {
            return [
              {
                id: `${baseId}-rss-unavailable`,
                mediaId: item.mediaId,
                type: "rss_item" as const,
                title: `${media.title ?? "RSS Feed"} unavailable`,
                summary: "The feed could not be loaded by the server. Playback will continue.",
                link: url,
                image: null,
                publishedAt: null,
                sourceTitle: media.title ?? null,
                rssStyle: media.rssStyle,
                duration: item.duration
              }
            ];
          }

          return feedItems.map((entry, index) => ({
            id: `${baseId}-rss-${index + 1}`,
            mediaId: item.mediaId,
            type: "rss_item" as const,
            title: entry.title,
            summary: entry.summary,
            link: entry.link,
            image: entry.image,
            publishedAt: entry.publishedAt,
            sourceTitle: media.title ?? null,
            rssStyle: media.rssStyle,
            duration: item.duration
          }));
        }

        return [
          {
            id: baseId,
            mediaId: item.mediaId,
            type: item.type,
            file: media ? media.filename : item.file,
            duration: item.duration,
            durationMode: item.durationMode
          }
        ];
      })
    );

    return playlistItems.flat();
  }))).flat();
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
