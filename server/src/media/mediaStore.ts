import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { assertValid, type DomainValidationIssue } from "../validation/domainValidation.js";
import type { BrowserAction } from "../../../shared/runtime.js";

export interface MediaItem {
  /**
   * Backward-compatible identifier retained for existing clients.
   * New code should use mediaId.
   */
  id: string;
  mediaId: string;
  filename: string;
  type: "image" | "video" | "web_url" | "rss_feed";
  size: number;
  title?: string;
  url?: string;
  duration?: number;
  maxItems?: number;
  webUrlRenderMode?: "iframe" | "browser";
  browserActions?: BrowserAction[];
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

function isExternalMediaType(type: unknown): type is "web_url" | "rss_feed" {
  return type === "web_url" || type === "rss_feed";
}

function getWebUrlRenderMode(value: unknown): "iframe" | "browser" {
  return value === "browser" ? "browser" : "iframe";
}

function normalizeBrowserActions(value: unknown): BrowserAction[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((candidate): BrowserAction[] => {
    if (!candidate || typeof candidate !== "object") {
      return [];
    }

    const action = candidate as Partial<BrowserAction> & Record<string, unknown>;

    if (action.type === "wait") {
      return [
        {
          id: typeof action.id === "string" ? action.id : undefined,
          type: "wait",
          waitMs: Number(action.waitMs ?? 1000)
        }
      ];
    }

    if (action.type === "click") {
      const selector = typeof action.selector === "string" ? action.selector.trim() : "";

      return [
        {
          id: typeof action.id === "string" ? action.id : undefined,
          type: "click",
          selector,
          timeoutMs: Number(action.timeoutMs ?? 5000)
        }
      ];
    }

    if (action.type === "refresh_interval") {
      return [
        {
          id: typeof action.id === "string" ? action.id : undefined,
          type: "refresh_interval",
          intervalSeconds: Number(action.intervalSeconds ?? 300)
        }
      ];
    }

    return [];
  });
}

function isValidExternalUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

  if ((item.type === "image" || item.type === "video") && getMediaType(item.filename) !== item.type) {
    issues.push({
      ruleId: "VAL-MEDIA-002",
      field: "type",
      severity: "blocking_error",
      message: "Media type must match a supported file extension."
    });
  }

  if (item.type === "web_url" && !isValidExternalUrl(item.url)) {
    issues.push({
      ruleId: "VAL-MEDIA-004",
      field: "url",
      severity: "blocking_error",
      message: "Web URL media must use a valid http or https URL."
    });
  }

  if (item.type === "rss_feed" && !isValidExternalUrl(item.url)) {
    issues.push({
      ruleId: "VAL-MEDIA-004",
      field: "url",
      severity: "blocking_error",
      message: "RSS Feed media must use a valid http or https URL."
    });
  }

  if (
    item.type === "web_url" &&
    item.webUrlRenderMode !== undefined &&
    item.webUrlRenderMode !== "iframe" &&
    item.webUrlRenderMode !== "browser"
  ) {
    issues.push({
      ruleId: "VAL-MEDIA-005",
      field: "webUrlRenderMode",
      severity: "blocking_error",
      message: "Web URL render mode must be iframe or browser."
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

  if (item.type === "web_url" && item.browserActions && item.browserActions.length > 5) {
    issues.push({
      ruleId: "VAL-MEDIA-006",
      field: "browserActions",
      severity: "blocking_error",
      message: "Web URL browser automation supports a maximum of 5 actions."
    });
  }

  if (item.type === "web_url") {
    for (const [index, action] of (item.browserActions ?? []).entries()) {
      if (action.type === "wait" && (!Number.isFinite(action.waitMs) || action.waitMs < 0 || action.waitMs > 15_000)) {
        issues.push({
          ruleId: "VAL-MEDIA-006",
          field: `browserActions.${index}.waitMs`,
          severity: "blocking_error",
          message: "WAIT action duration must be between 0 and 15000 ms."
        });
      } else if (
        action.type === "click" &&
        (!action.selector.trim() ||
          (action.timeoutMs !== undefined && (!Number.isFinite(action.timeoutMs) || action.timeoutMs < 0 || action.timeoutMs > 15_000)))
      ) {
        issues.push({
          ruleId: "VAL-MEDIA-006",
          field: `browserActions.${index}.selector`,
          severity: "blocking_error",
          message: "CLICK action requires a selector and an optional timeout up to 15000 ms."
        });
      } else if (
        action.type === "refresh_interval" &&
        (!Number.isFinite(action.intervalSeconds) || action.intervalSeconds < 30)
      ) {
        issues.push({
          ruleId: "VAL-MEDIA-006",
          field: `browserActions.${index}.intervalSeconds`,
          severity: "blocking_error",
          message: "REFRESH interval must be at least 30 seconds."
        });
      }
    }
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
    (typeof candidate.filename !== "string" && !isExternalMediaType(candidate.type)) ||
    (candidate.type !== "image" &&
      candidate.type !== "video" &&
      candidate.type !== "web_url" &&
      candidate.type !== "rss_feed")
  ) {
    return null;
  }

  if (candidate.type === "web_url" || candidate.type === "rss_feed") {
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : undefined;
    const filename = typeof candidate.filename === "string" && candidate.filename.trim()
      ? candidate.filename
      : title ?? url;

    return {
      id:
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id
          : createStableMediaId(),
      mediaId:
        typeof candidate.mediaId === "string" && candidate.mediaId.trim()
          ? candidate.mediaId
          : createStableMediaId(),
      filename,
      type: candidate.type,
      size: 0,
      title,
      url,
      duration: Math.max(Number(candidate.duration ?? 10), 1),
      webUrlRenderMode: candidate.type === "web_url" ? getWebUrlRenderMode(candidate.webUrlRenderMode) : undefined,
      browserActions: candidate.type === "web_url" ? normalizeBrowserActions(candidate.browserActions) : undefined,
      maxItems: candidate.type === "rss_feed" ? Math.max(Math.min(Number(candidate.maxItems ?? 5), 20), 1) : undefined
    };
  }

  if (
    typeof candidate.filename !== "string" ||
    (candidate.type !== "image" && candidate.type !== "video")
  ) {
    return null;
  }

  const filename = candidate.filename;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : toLegacyMediaId(filename),
    mediaId:
      typeof candidate.mediaId === "string" && candidate.mediaId.trim()
        ? candidate.mediaId
        : createStableMediaId(),
    filename,
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
  const externalItems = metadata.filter((item) => item.type === "web_url" || item.type === "rss_feed");
  const metadataByFilename = new Map(
    metadata
      .filter((item) => item.type === "image" || item.type === "video")
      .map((item) => [item.filename, item])
  );
  const usedMediaIds = new Set<string>();
  const fileItems = (
    await Promise.all(
      filenames.map((filename) => itemFromFile(filename, metadataByFilename.get(filename), usedMediaIds))
    )
  )
    .filter((item): item is MediaItem => item !== null)
    .sort((first, second) => first.filename.localeCompare(second.filename));
  const items = [...fileItems, ...externalItems].sort((first, second) =>
    (first.title ?? first.filename).localeCompare(second.title ?? second.filename)
  );

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

export async function createExternalMedia(input: unknown): Promise<MediaItem> {
  const candidate = input && typeof input === "object" ? (input as Partial<MediaItem>) : {};
  const type = candidate.type;

  if (type !== "web_url" && type !== "rss_feed") {
    assertValid([
      {
        ruleId: "VAL-MEDIA-002",
        field: "type",
        severity: "blocking_error",
        message: "External media type must be Web URL or RSS Feed."
      }
    ]);
    throw new Error("invalid external media type");
  }

  const externalType: "web_url" | "rss_feed" = type;
  const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : undefined;
  const duration = Math.max(Number(candidate.duration ?? 10), 1);
  const maxItems = externalType === "rss_feed" ? Math.max(Math.min(Number(candidate.maxItems ?? 5), 20), 1) : undefined;
  const webUrlRenderMode = externalType === "web_url" ? getWebUrlRenderMode(candidate.webUrlRenderMode) : undefined;
  const browserActions = externalType === "web_url" ? normalizeBrowserActions(candidate.browserActions) : undefined;
  const mediaId = createStableMediaId();
  const item: MediaItem = {
    id: mediaId,
    mediaId,
    filename: title ?? url,
    type: externalType,
    size: 0,
    title,
    url,
    duration,
    webUrlRenderMode,
    browserActions,
    maxItems
  };

  assertValid(validateMediaItem(item));
  const items = await listMedia();
  await writeMetadataFile([...items, item]);
  return item;
}

export async function updateExternalMedia(id: string, input: unknown): Promise<MediaItem | null> {
  const items = await listMedia();
  const index = items.findIndex((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (index === -1) {
    return null;
  }

  const existingItem = items[index];

  if (existingItem.type !== "web_url" && existingItem.type !== "rss_feed") {
    assertValid([
      {
        ruleId: "VAL-MEDIA-002",
        field: "type",
        severity: "blocking_error",
        message: "Only Web URL and RSS Feed media can be edited through this endpoint."
      }
    ]);
  }

  const candidate = input && typeof input === "object" ? (input as Partial<MediaItem>) : {};
  const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : undefined;
  const url = typeof candidate.url === "string" ? candidate.url.trim() : existingItem.url ?? "";
  const duration = Math.max(Number(candidate.duration ?? existingItem.duration ?? 10), 1);
  const maxItems = existingItem.type === "rss_feed"
    ? Math.max(Math.min(Number(candidate.maxItems ?? existingItem.maxItems ?? 5), 20), 1)
    : undefined;
  const webUrlRenderMode = existingItem.type === "web_url"
    ? getWebUrlRenderMode(candidate.webUrlRenderMode ?? existingItem.webUrlRenderMode)
    : undefined;
  const browserActions = existingItem.type === "web_url"
    ? normalizeBrowserActions(candidate.browserActions ?? existingItem.browserActions)
    : undefined;

  const updatedItem: MediaItem = {
    ...existingItem,
    filename: title ?? url,
    title,
    url,
    duration,
    maxItems,
    webUrlRenderMode,
    browserActions
  };

  assertValid(validateMediaItem(updatedItem));
  const updatedItems = [...items];
  updatedItems[index] = updatedItem;
  await writeMetadataFile(updatedItems);
  return updatedItem;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const items = await listMedia();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item) {
    return false;
  }

  if (item.type === "image" || item.type === "video") {
    try {
      const filePath = getMediaPath(item.filename);
      await access(filePath);
      await unlink(filePath);
    } catch {
      // Metadata is still removed even if the file is already gone.
    }
  }

  await writeMetadataFile(items.filter((mediaItem) => mediaItem.mediaId !== item.mediaId));
  return true;
}
