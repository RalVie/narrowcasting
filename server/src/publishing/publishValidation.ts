import { listMedia, resolveMediaReferenceFromList } from "../media/mediaStore.js";
import { listPlaylists } from "../playlist/playlistStore.js";
import { getProgramsOrDefault } from "../program/programStore.js";
import { listScreenGroups } from "../screens/screenGroupStore.js";
import { listScreens } from "../screens/screenStore.js";
import { getThemeOrDefault } from "../theme/themeStore.js";
import type { AssignmentTargetType } from "../assignments/assignmentStore.js";

export type PublishValidationSeverity = "blocking_error" | "warning" | "info";

export interface PublishValidationMessage {
  id: string;
  severity: PublishValidationSeverity;
  category:
    | "media"
    | "playlist"
    | "program"
    | "theme"
    | "assignment"
    | "campaign"
    | "deployment";
  ruleId: string;
  message: string;
  affectedObject?: {
    type: string;
    id: string;
    name?: string;
  };
  suggestedFix?: string;
}

export interface PublishValidationReport {
  status: "ready" | "warnings" | "blocked";
  summary: {
    blockingErrors: number;
    warnings: number;
    information: number;
  };
  blockingErrors: PublishValidationMessage[];
  warnings: PublishValidationMessage[];
  information: PublishValidationMessage[];
  affectedObjects: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  suggestedFixes: string[];
  generatedAt: string;
}

export interface PublishValidationIntent {
  campaignId?: string;
  name: string;
  enabled: boolean;
  programId: string;
  targetType: AssignmentTargetType;
  targetIds: string[];
}

export class PublishValidationError extends Error {
  constructor(public report: PublishValidationReport) {
    super("Publishing blocked by validation.");
  }
}

function message(input: Omit<PublishValidationMessage, "id">): PublishValidationMessage {
  return {
    ...input,
    id: `${input.ruleId}:${input.affectedObject?.id ?? input.category}:${input.message}`
  };
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildReport(messages: PublishValidationMessage[]): PublishValidationReport {
  const blockingErrors = messages.filter((item) => item.severity === "blocking_error");
  const warnings = messages.filter((item) => item.severity === "warning");
  const information = messages.filter((item) => item.severity === "info");
  const affectedObjects = uniqueByKey(
    messages
      .map((item) => item.affectedObject)
      .filter((item): item is NonNullable<PublishValidationMessage["affectedObject"]> => Boolean(item)),
    (item) => `${item.type}:${item.id}`
  );
  const suggestedFixes = Array.from(
    new Set(messages.map((item) => item.suggestedFix).filter((item): item is string => Boolean(item)))
  );

  return {
    status: blockingErrors.length > 0 ? "blocked" : warnings.length > 0 ? "warnings" : "ready",
    summary: {
      blockingErrors: blockingErrors.length,
      warnings: warnings.length,
      information: information.length
    },
    blockingErrors,
    warnings,
    information,
    affectedObjects,
    suggestedFixes,
    generatedAt: new Date().toISOString()
  };
}

export function publishValidationErrorResponse(error: PublishValidationError) {
  return {
    error: "validation_error",
    code: "VALIDATION_FAILED",
    message: "Publishing blocked by validation.",
    report: error.report
  };
}

export async function validatePublishIntent(intent: PublishValidationIntent): Promise<PublishValidationReport> {
  const [mediaItems, playlists, programs, screens, screenGroups, theme] = await Promise.all([
    listMedia(),
    listPlaylists(),
    getProgramsOrDefault(),
    listScreens(),
    listScreenGroups(),
    getThemeOrDefault()
  ]);
  const messages: PublishValidationMessage[] = [];
  const approvedScreens = screens.filter((screen) => screen.status === "approved");
  const mediaIds = new Set<string>();

  for (const media of mediaItems) {
    if (mediaIds.has(media.mediaId)) {
      messages.push(
        message({
          severity: "blocking_error",
          category: "media",
          ruleId: "VAL-MEDIA-001",
          message: "Media IDs must be unique before publishing.",
          affectedObject: { type: "Media", id: media.mediaId, name: media.filename },
          suggestedFix: "Repair duplicate media metadata before publishing."
        })
      );
    }

    mediaIds.add(media.mediaId);

    if (media.type !== "image" && media.type !== "video") {
      messages.push(
        message({
          severity: "blocking_error",
          category: "media",
          ruleId: "VAL-MEDIA-002",
          message: "Media type is not supported for publishing.",
          affectedObject: { type: "Media", id: media.mediaId, name: media.filename },
          suggestedFix: "Use supported image or video media."
        })
      );
    }
  }

  if (approvedScreens.length === 0) {
    messages.push(
      message({
        severity: "warning",
        category: "deployment",
        ruleId: "VAL-SCREEN-003",
        message: "No approved screens are currently available.",
        suggestedFix: "Approve at least one screen before expecting playback."
      })
    );
  }

  if (!intent.enabled) {
    messages.push(
      message({
        severity: "info",
        category: "campaign",
        ruleId: "VAL-CAMPAIGN-002",
        message: "Campaign is disabled and will not create active runtime assignments.",
        affectedObject: intent.campaignId
          ? { type: "Campaign", id: intent.campaignId, name: intent.name }
          : undefined
      })
    );
  }

  const program = programs.find((item) => item.id === intent.programId);

  if (!program) {
    messages.push(
      message({
        severity: "blocking_error",
        category: "campaign",
        ruleId: "VAL-CAMPAIGN-003",
        message: "Campaign must reference an existing program.",
        affectedObject: { type: "Program", id: intent.programId || "missing" },
        suggestedFix: "Select a valid program."
      })
    );
  } else {
    messages.push(
      message({
        severity: "info",
        category: "program",
        ruleId: "VAL-PROGRAM-001",
        message: `Program "${program.name}" will be published.`,
        affectedObject: { type: "Program", id: program.id, name: program.name }
      })
    );

    if (program.playlistIds.length === 0) {
      messages.push(
        message({
          severity: "blocking_error",
          category: "program",
          ruleId: "VAL-PROGRAM-004",
          message: "Program must contain at least one playlist before publishing.",
          affectedObject: { type: "Program", id: program.id, name: program.name },
          suggestedFix: "Add at least one playlist to the program."
        })
      );
    }

    for (const playlistId of program.playlistIds) {
      const playlist = playlists.find((item) => item.id === playlistId);

      if (!playlist) {
        messages.push(
          message({
            severity: "blocking_error",
            category: "program",
            ruleId: "VAL-PROGRAM-002",
            message: "Program references a missing playlist.",
            affectedObject: { type: "Playlist", id: playlistId },
            suggestedFix: "Remove the missing playlist from the program or recreate it."
          })
        );
        continue;
      }

      if (playlist.items.length === 0) {
        messages.push(
          message({
            severity: "blocking_error",
            category: "playlist",
            ruleId: "VAL-PROGRAM-004",
            message: "Playlist is empty and cannot be published.",
            affectedObject: { type: "Playlist", id: playlist.id, name: playlist.name },
            suggestedFix: "Add at least one media item to the playlist."
          })
        );
      }

      for (const item of playlist.items) {
        const media =
          resolveMediaReferenceFromList(mediaItems, item.mediaId) ??
          resolveMediaReferenceFromList(mediaItems, item.file);

        if (!media) {
          messages.push(
            message({
              severity: "blocking_error",
              category: "playlist",
              ruleId: "VAL-PLAYLIST-003",
              message: "Playlist item references missing media.",
              affectedObject: { type: "Playlist", id: playlist.id, name: playlist.name },
              suggestedFix: "Replace or remove playlist items that reference missing media."
            })
          );
          continue;
        }

        if (media.type !== item.type) {
          messages.push(
            message({
              severity: "blocking_error",
              category: "playlist",
              ruleId: "VAL-ITEM-002",
              message: "Playlist item media type does not match the referenced media.",
              affectedObject: { type: "Media", id: media.mediaId, name: media.filename },
              suggestedFix: "Refresh the playlist item or replace the media reference."
            })
          );
        }

        if (!Number.isFinite(item.duration) || item.duration <= 0) {
          messages.push(
            message({
              severity: "blocking_error",
              category: "playlist",
              ruleId: "VAL-PLAYLIST-004",
              message: "Playlist item duration must be positive.",
              affectedObject: { type: "Playlist", id: playlist.id, name: playlist.name },
              suggestedFix: "Set a positive display duration."
            })
          );
        }
      }
    }
  }

  if (intent.targetIds.length === 0) {
    messages.push(
      message({
        severity: "blocking_error",
        category: "campaign",
        ruleId: "VAL-CAMPAIGN-004",
        message: "Campaign must target at least one screen or screen group.",
        suggestedFix: "Select at least one target."
      })
    );
  }

  if (intent.targetType === "SCREEN") {
    for (const targetId of intent.targetIds) {
      const screen = screens.find((item) => item.screenId === targetId);

      if (!screen || screen.status !== "approved") {
        messages.push(
          message({
            severity: "blocking_error",
            category: "deployment",
            ruleId: "VAL-SCREEN-003",
            message: "Campaign target screen must exist and be approved.",
            affectedObject: { type: "Screen", id: targetId, name: screen?.name },
            suggestedFix: "Approve the screen or remove it from the campaign target list."
          })
        );
      }
    }
  } else {
    for (const targetId of intent.targetIds) {
      const group = screenGroups.find((item) => item.groupId === targetId);

      if (!group) {
        messages.push(
          message({
            severity: "blocking_error",
            category: "deployment",
            ruleId: "VAL-GROUP-002",
            message: "Campaign target screen group must exist.",
            affectedObject: { type: "ScreenGroup", id: targetId },
            suggestedFix: "Select an existing screen group."
          })
        );
        continue;
      }

      const approvedMembers = group.screenIds
        .map((screenId) => screens.find((screen) => screen.screenId === screenId))
        .filter((screen) => screen?.status === "approved");

      if (approvedMembers.length === 0) {
        messages.push(
          message({
            severity: "blocking_error",
            category: "deployment",
            ruleId: "VAL-GROUP-002",
            message: "Campaign target screen group has no approved screens.",
            affectedObject: { type: "ScreenGroup", id: group.groupId, name: group.name },
            suggestedFix: "Add at least one approved screen to the group."
          })
        );
      }
    }
  }

  if (!theme.regions || theme.regions.length === 0) {
    messages.push(
      message({
        severity: "blocking_error",
        category: "theme",
        ruleId: "VAL-THEME-003",
        message: "Theme must contain at least one renderable region.",
        affectedObject: { type: "Theme", id: theme.id, name: theme.name },
        suggestedFix: "Add a Program region to the theme."
      })
    );
  }

  if (theme.backgroundMediaId) {
    const media = resolveMediaReferenceFromList(mediaItems, theme.backgroundMediaId);

    if (!media || media.type !== "image") {
      messages.push(
        message({
          severity: "blocking_error",
          category: "theme",
          ruleId: "VAL-THEME-005",
          message: "Theme background media must reference existing image media.",
          affectedObject: { type: "Theme", id: theme.id, name: theme.name },
          suggestedFix: "Select an existing image for the theme background or clear the background media."
        })
      );
    }
  }

  for (const region of theme.regions) {
    if ((region.type === "logo" || region.type === "image") && region.mediaId) {
      const media = resolveMediaReferenceFromList(mediaItems, region.mediaId);

      if (!media || media.type !== "image") {
        messages.push(
          message({
            severity: "blocking_error",
            category: "theme",
            ruleId: "VAL-THEME-005",
            message: "Theme logo and image regions must reference existing image media.",
            affectedObject: { type: "ThemeRegion", id: region.id, name: region.name },
            suggestedFix: "Select an existing image for the theme region or remove the region media reference."
          })
        );
      }
    }
  }

  const generatedAssignments = intent.enabled ? intent.targetIds.length : 0;
  messages.push(
    message({
      severity: "info",
      category: "assignment",
      ruleId: "VAL-ASSIGN-001",
      message: `Publishing will produce ${generatedAssignments} campaign-managed assignment${generatedAssignments === 1 ? "" : "s"}.`
    })
  );

  return buildReport(messages);
}

export function assertPublishable(report: PublishValidationReport) {
  if (report.summary.blockingErrors > 0) {
    throw new PublishValidationError(report);
  }
}
