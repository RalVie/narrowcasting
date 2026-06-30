import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { assertValid, type DomainValidationIssue } from "../validation/domainValidation.js";

export interface MediaItem {
  /**
   * Backward-compatible identifier retained for existing clients.
   * New code should use mediaId.
   */
  id: string;
  mediaId: string;
  filename: string;
  type: "image" | "video";
  size: number;
}

type MediaReference = string | undefined;

const mediaRoot = resolve(process.cwd(), "public", "media");
const metadataPath = resolve(process.cwd(), "data", "media.json");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm"]);

export function getMediaRoot() {
  return mediaRoot;
}

export function getMediaPath(filename: string) {
  const safeFilename = basename(filename);
  const filePath = resolve(mediaRoot, safeFilename);

  if (safeFilename !== filename || !filePath.startsWith(mediaRoot)) {
    throw new Error("invalid media filename");
  }

  return filePath;
}

export function getMediaContentType(filename: string) {
  switch (extname(filename).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

export function resolveMediaReferenceFromList(
  mediaItems: MediaItem[],
  reference: MediaReference
): MediaItem | null {
  if (!reference) {
    return null;
  }

  const normalizedReference = reference.trim();

  if (!normalizedReference) {
    return null;
  }

  const matches = mediaItems.filter(
    (item) =>
      item.mediaId === normalizedReference ||
      item.id === normalizedReference ||
      item.filename === normalizedReference
  );
  const uniqueMediaIds = new Set(matches.map((item) => item.mediaId));

  if (uniqueMediaIds.size !== 1) {
    return null;
  }

  return matches[0] ?? null;
}

function toLegacyMediaId(filename: string) {
  const extension = extname(filename).toLowerCase().replace(".", "");
  const baseId = basename(filename, extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");

  if (extension === "jpg" || extension === "jpeg") {
    return baseId;
  }

  return `${baseId}-${extension}`;
}

function createStableMediaId() {
  return randomUUID();
}

function isImageFilename(filename: string) {
  return imageExtensions.has(extname(filename).toLowerCase());
}

function isVideoFilename(filename: string) {
  return videoExtensions.has(extname(filename).toLowerCase());
}

function getMediaType(filename: string): MediaItem["type"] | null {
  if (isImageFilename(filename)) {
    return "image";
  }

  if (isVideoFilename(filename)) {
    return "video";
  }

  return null;
}

function validateMediaItem(item: MediaItem, existingIds = new Set<string>()): DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];

  if (!item.mediaId.trim()) {
    issues.push({
      ruleId: "VAL-MEDIA-001",
      field: "mediaId",
      severity: "blocking_error",
      message: "Media must have a stable mediaId."
    });
  }

  if (existingIds.has(item.mediaId)) {
    issues.push({
      ruleId: "VAL-MEDIA-001",
      field: "mediaId",
      severity: "blocking_error",
      message: "Media IDs must be unique."
    });
  }

  if (!item.filename.trim()) {
    issues.push({
      ruleId: "VAL-MEDIA-001",
      field: "filename",
      severity: "blocking_error",
      message: "Media filename is required."
    });
  }

  if (getMediaType(item.filename) !== item.type) {
    issues.push({
      ruleId: "VAL-MEDIA-002",
      field: "type",
      severity: "blocking_error",
      message: "Media type must match a supported file extension."
    });
  }

  if (!Number.isFinite(item.size) || item.size < 0) {
    issues.push({
      ruleId: "VAL-MEDIA-003",
      field: "size",
      severity: "blocking_error",
      message: "Media size must be a valid number."
    });
  }

  return issues;
}

function validateMediaCollection(items: MediaItem[]) {
  const usedIds = new Set<string>();
  const issues = items.flatMap((item) => {
    const itemIssues = validateMediaItem(item, usedIds);
    usedIds.add(item.mediaId);
    return itemIssues;
  });

  assertValid(issues);
}

function normalizeMetadataItem(value: unknown): MediaItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MediaItem>;

  if (
    typeof candidate.filename !== "string" ||
    (candidate.type !== "image" && candidate.type !== "video")
  ) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : toLegacyMediaId(candidate.filename),
    mediaId:
      typeof candidate.mediaId === "string" && candidate.mediaId.trim()
        ? candidate.mediaId
        : createStableMediaId(),
    filename: candidate.filename,
    type: candidate.type,
    size: typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : 0
  };
}

async function readMetadataFile(): Promise<MediaItem[]> {
  try {
    const content = await readFile(metadataPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value
        .map((item) => normalizeMetadataItem(item))
        .filter((item): item is MediaItem => item !== null);
    }
  } catch {
    return [];
  }

  return [];
}

async function writeMetadataFile(items: MediaItem[]) {
  validateMediaCollection(items);
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function getStableMediaId(existingItem: MediaItem | undefined, usedMediaIds: Set<string>) {
  if (existingItem?.mediaId && !usedMediaIds.has(existingItem.mediaId)) {
    usedMediaIds.add(existingItem.mediaId);
    return existingItem.mediaId;
  }

  let mediaId = createStableMediaId();

  while (usedMediaIds.has(mediaId)) {
    mediaId = createStableMediaId();
  }

  usedMediaIds.add(mediaId);
  return mediaId;
}

async function itemFromFile(
  filename: string,
  existingItem: MediaItem | undefined,
  usedMediaIds: Set<string>
): Promise<MediaItem | null> {
  const mediaType = getMediaType(filename);

  if (!mediaType) {
    return null;
  }

  const filePath = getMediaPath(filename);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    return null;
  }

  return {
    id: existingItem?.id ?? toLegacyMediaId(filename),
    mediaId: getStableMediaId(existingItem, usedMediaIds),
    filename,
    type: mediaType,
    size: fileStat.size
  };
}

export async function listMedia(): Promise<MediaItem[]> {
  await mkdir(mediaRoot, { recursive: true });

  const [filenames, metadata] = await Promise.all([
    readdir(mediaRoot),
    readMetadataFile()
  ]);
  const metadataByFilename = new Map(metadata.map((item) => [item.filename, item]));
  const usedMediaIds = new Set<string>();
  const items = (
    await Promise.all(
      filenames.map((filename) => itemFromFile(filename, metadataByFilename.get(filename), usedMediaIds))
    )
  )
    .filter((item): item is MediaItem => item !== null)
    .sort((first, second) => first.filename.localeCompare(second.filename));

  await writeMetadataFile(items);
  return items;
}

export async function createMedia(filename: string, content: Buffer): Promise<MediaItem> {
  const safeFilename = basename(filename).replace(/[^a-zA-Z0-9._-]+/g, "-");

  const mediaType = getMediaType(safeFilename);

  if (!safeFilename || !mediaType) {
    assertValid([
      {
        ruleId: "VAL-MEDIA-002",
        field: "filename",
        severity: "blocking_error",
        message: "Only jpg, jpeg, png, webp, mp4, and webm media files are supported."
      }
    ]);
  }

  await mkdir(mediaRoot, { recursive: true });
  const filePath = getMediaPath(safeFilename);
  await writeFile(filePath, content);

  const items = await listMedia();
  const item = items.find((mediaItem) => mediaItem.filename === safeFilename);

  if (!item) {
    throw new Error("media metadata could not be created");
  }

  return item;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const items = await listMedia();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item) {
    return false;
  }

  try {
    const filePath = getMediaPath(item.filename);
    await access(filePath);
    await unlink(filePath);
  } catch {
    // Metadata is still removed even if the file is already gone.
  }

  await writeMetadataFile(items.filter((mediaItem) => mediaItem.mediaId !== item.mediaId));
  return true;
}
