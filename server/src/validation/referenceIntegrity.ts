import { listAssignments } from "../assignments/assignmentStore.js";
import { listCampaigns } from "../campaigns/campaignStore.js";
import { listMedia, resolveMediaReferenceFromList } from "../media/mediaStore.js";
import { listPlaylists, removeMediaFromPlaylists } from "../playlist/playlistStore.js";
import { getProgramsOrDefault } from "../program/programStore.js";
import { readScheduler } from "../scheduler/schedulerStore.js";
import { listThemes, removeMediaFromThemes } from "../theme/themeStore.js";

export interface ReferenceUsage {
  objectType: string;
  objectId: string;
  objectName: string;
  field: string;
}

export interface MediaUsageReference {
  type: "playlist" | "theme";
  id: string;
  name: string;
  field?: string;
  regionName?: string;
}

export interface MediaUsageAnalysis {
  mediaId: string;
  canTrash: boolean;
  references: MediaUsageReference[];
}

export interface ReferenceValidationError {
  error: "validation_error";
  code: "REFERENCE_IN_USE" | "ASSIGNMENT_MANAGED_BY_CAMPAIGN";
  message: string;
  objectType: string;
  objectId: string;
  references: ReferenceUsage[];
}

export type ReferenceValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: ReferenceValidationError;
    };

function inUseError(
  objectType: string,
  objectId: string,
  references: ReferenceUsage[]
): ReferenceValidationResult {
  return {
    ok: false,
    error: {
      error: "validation_error",
      code: "REFERENCE_IN_USE",
      message: `${objectType} cannot be deleted because it is still referenced.`,
      objectType,
      objectId,
      references
    }
  };
}

function resultForReferences(objectType: string, objectId: string, references: ReferenceUsage[]) {
  return references.length > 0 ? inUseError(objectType, objectId, references) : { ok: true as const };
}

function assignmentOwnershipError(
  assignmentId: string,
  campaignId: string,
  campaignName: string
): ReferenceValidationResult {
  return {
    ok: false,
    error: {
      error: "validation_error",
      code: "ASSIGNMENT_MANAGED_BY_CAMPAIGN",
      message: "Assignment cannot be manually deleted because it is managed by campaign.",
      objectType: "Assignment",
      objectId: assignmentId,
      references: [
        {
          objectType: "Campaign",
          objectId: campaignId,
          objectName: campaignName,
          field: "generatedAssignments"
        }
      ]
    }
  };
}

export async function validateMediaDelete(reference: string): Promise<ReferenceValidationResult> {
  const mediaItems = await listMedia();
  const media = resolveMediaReferenceFromList(mediaItems, reference);

  if (!media) {
    return { ok: true };
  }

  const [playlists, themes] = await Promise.all([listPlaylists(), listThemes()]);
  const references: ReferenceUsage[] = [];

  for (const playlist of playlists) {
    const isUsed = playlist.items.some(
      (item) => item.mediaId === media.mediaId || item.mediaId === media.id || item.file === media.filename
    );

    if (isUsed) {
      references.push({
        objectType: "Playlist",
        objectId: playlist.id,
        objectName: playlist.name,
        field: "items.mediaId"
      });
    }
  }

  for (const theme of themes) {
    if (theme.backgroundMediaId === media.mediaId || theme.backgroundMediaId === media.id) {
      references.push({
        objectType: "Theme",
        objectId: theme.id,
        objectName: theme.name,
        field: "backgroundMediaId"
      });
    }

    const isRegionMedia = theme.regions.some(
      (region) =>
        (region.type === "logo" || region.type === "image") &&
        (region.mediaId === media.mediaId || region.mediaId === media.id || region.file === media.filename)
    );

    if (isRegionMedia) {
      references.push({
        objectType: "Theme",
        objectId: theme.id,
        objectName: theme.name,
        field: "regions.mediaId"
      });
    }
  }

  return resultForReferences("Media", media.mediaId, references);
}

export async function analyzeMediaUsage(reference: string): Promise<MediaUsageAnalysis | null> {
  const mediaItems = await listMedia();
  const media = resolveMediaReferenceFromList(mediaItems, reference);

  if (!media) {
    return null;
  }

  const [playlists, themes] = await Promise.all([listPlaylists(), listThemes()]);
  const references: MediaUsageReference[] = [];

  for (const playlist of playlists) {
    playlist.items.forEach((item) => {
      if (item.mediaId === media.mediaId || item.mediaId === media.id || item.file === media.filename) {
        references.push({
          type: "playlist",
          id: playlist.id,
          name: playlist.name,
          field: "items"
        });
      }
    });
  }

  for (const theme of themes) {
    if (theme.backgroundMediaId === media.mediaId || theme.backgroundMediaId === media.id) {
      references.push({
        type: "theme",
        id: theme.id,
        name: theme.name,
        field: "backgroundMediaId",
        regionName: "Background"
      });
    }

    theme.regions.forEach((region) => {
      if (
        (region.type === "logo" || region.type === "image") &&
        (region.mediaId === media.mediaId || region.mediaId === media.id || region.file === media.filename)
      ) {
        references.push({
          type: "theme",
          id: theme.id,
          name: theme.name,
          field: "regions.mediaId",
          regionName: region.name
        });
      }
    });
  }

  return {
    mediaId: media.mediaId,
    canTrash: references.length === 0,
    references
  };
}

export async function removeMediaFromAllReferences(reference: string) {
  const mediaItems = await listMedia();
  const media = resolveMediaReferenceFromList(mediaItems, reference);

  if (!media) {
    return null;
  }

  const [playlists, themes] = await Promise.all([
    removeMediaFromPlaylists(media),
    removeMediaFromThemes(media)
  ]);

  return {
    mediaId: media.mediaId,
    playlists,
    themes
  };
}

export async function validatePlaylistDelete(playlistId: string): Promise<ReferenceValidationResult> {
  const programs = await getProgramsOrDefault();
  const references = programs
    .filter((program) => program.playlistIds.includes(playlistId))
    .map((program) => ({
      objectType: "Program",
      objectId: program.id,
      objectName: program.name,
      field: "playlistIds"
    }));

  return resultForReferences("Playlist", playlistId, references);
}

export async function validateProgramDelete(programId: string): Promise<ReferenceValidationResult> {
  const [assignments, campaigns] = await Promise.all([listAssignments(), listCampaigns()]);
  const references: ReferenceUsage[] = [
    ...assignments
      .filter((assignment) => assignment.programId === programId)
      .map((assignment) => ({
        objectType: "Assignment",
        objectId: assignment.id,
        objectName: `${assignment.targetType} ${assignment.targetId}`,
        field: "programId"
      })),
    ...campaigns
      .filter((campaign) => campaign.programId === programId)
      .map((campaign) => ({
        objectType: "Campaign",
        objectId: campaign.id,
        objectName: campaign.name,
        field: "programId"
      }))
  ];

  return resultForReferences("Program", programId, references);
}

export async function validateThemeDelete(themeId: string): Promise<ReferenceValidationResult> {
  const scheduler = await readScheduler();
  const references = scheduler.blocks
    .filter((block) => block.themeId === themeId)
    .map((block) => ({
      objectType: "Legacy Scheduler Block",
      objectId: block.id,
      objectName: block.id,
      field: "themeId"
    }));

  return resultForReferences("Theme", themeId, references);
}

export async function validateScreenDelete(screenId: string): Promise<ReferenceValidationResult> {
  const assignments = await listAssignments();
  const references = assignments
    .filter((assignment) => assignment.targetType === "SCREEN" && assignment.targetId === screenId)
    .map((assignment) => ({
      objectType: "Assignment",
      objectId: assignment.id,
      objectName:
        assignment.sourceType === "campaign" && assignment.sourceName
          ? `Campaign: ${assignment.sourceName}`
          : `${assignment.sourceType} assignment`,
      field: "targetId"
    }));

  return resultForReferences("Screen", screenId, references);
}

export async function validateAssignmentDelete(assignmentId: string): Promise<ReferenceValidationResult> {
  const assignments = await listAssignments();
  const assignment = assignments.find((item) => item.id === assignmentId);

  if (!assignment || assignment.sourceType !== "campaign") {
    return { ok: true };
  }

  return assignmentOwnershipError(
    assignmentId,
    assignment.sourceId ?? assignment.id.split(":")[1] ?? assignment.id,
    assignment.sourceName ?? "Generated campaign assignment"
  );
}

export async function validateCampaignDelete(_campaignId: string): Promise<ReferenceValidationResult> {
  return { ok: true };
}
