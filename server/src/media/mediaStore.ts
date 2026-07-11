import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { assertValid, type DomainValidationIssue } from "../validation/domainValidation.js";
import type { BrowserAction, RssStyle } from "../../../shared/runtime.js";

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
  webUrlPlaybackMode?: "timed" | "persistent";
  maxItems?: number;
  rssStyle?: RssStyle;
  webUrlRenderMode?: "iframe" | "browser";
  browserActions?: BrowserAction[];
  originalFilename?: string;
  playbackFilename?: string;
  processedAt?: string;
  processingError?: string;
  processingStatus?: "uploaded" | "analyzing" | "processing" | "ready" | "failed";
  status?: "trashed";
  trashedAt?: string;
  trashFiles?: string[];
  thumbnailFilename?: string;
  videoProfile?: VideoProfile;
}

export interface VideoProfile {
  audioCodec?: string | null;
  bitrate?: number | null;
  container?: string | null;
  durationSeconds?: number | null;
  height?: number | null;
  level?: number | null;
  piSafe?: boolean;
  pixelFormat?: string | null;
  profile?: string | null;
  videoCodec?: string | null;
  width?: number | null;
}

type MediaReference = string | undefined;

const mediaRoot = resolve(process.cwd(), "public", "media");
const thumbnailRoot = resolve(process.cwd(), "public", "thumbnails");
const metadataPath = resolve(process.cwd(), "data", "media.json");
const mediaTrashRoot = resolve(process.cwd(), "data", "trash", "media");
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm"]);
const execFileAsync = promisify(execFile);
let videoProcessingActive = false;
const videoProcessingQueue: VideoProcessingJob[] = [];
const rssTextSizePresets = new Set(["small", "normal", "large", "extra-large"]);

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

export function getThumbnailPath(filename: string) {
  const safeFilename = basename(filename);
  const filePath = resolve(thumbnailRoot, safeFilename);

  if (safeFilename !== filename || !filePath.startsWith(thumbnailRoot) || extname(safeFilename).toLowerCase() !== ".jpg") {
    throw new Error("invalid thumbnail filename");
  }

  return filePath;
}

export function getThumbnailContentType() {
  return "image/jpeg";
}

function getVideoThumbnailFilename(mediaId: string) {
  return `${mediaId.replace(/[^a-zA-Z0-9_-]+/g, "-")}.jpg`;
}

function getMediaTrashPath(mediaId: string, filename: string) {
  const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safeFilename = basename(filename);
  const trashPath = resolve(mediaTrashRoot, safeMediaId, safeFilename);

  if (safeFilename !== filename || !trashPath.startsWith(resolve(mediaTrashRoot, safeMediaId))) {
    throw new Error("invalid media trash filename");
  }

  return trashPath;
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

function isVideoReady(item: MediaItem) {
  return item.type !== "video" || item.processingStatus === undefined || item.processingStatus === "ready";
}

export function isMediaReadyForPlaylist(item: MediaItem) {
  return isVideoReady(item);
}

interface VideoProcessingJob {
  mediaId: string;
  uploadFilename?: string;
}

function createTempPrefix(filename: string, mediaId: string) {
  const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const extension = extname(filename);
  const base = basename(filename, extension);

  return `${base}.${safeMediaId}`;
}

function createUploadTempFilename(filename: string, mediaId: string) {
  return `${createTempPrefix(filename, mediaId)}.upload.tmp`;
}

function createNormalizedTempFilename(filename: string, mediaId: string) {
  return `${createTempPrefix(filename, mediaId)}.normalized.tmp.mp4`;
}

function isTemporaryMediaFilename(filename: string) {
  return filename.endsWith(".upload.tmp") || filename.includes(".normalized.tmp.");
}

function isLegacyNormalizedMediaFilename(filename: string) {
  return /^normalized-[a-zA-Z0-9_-]+\.mp4$/.test(filename);
}

function getMediaIdFromUploadTempFilename(filename: string) {
  const match = /^.+\.([a-f0-9-]{36})\.upload\.tmp$/i.exec(filename);
  return match?.[1] ?? null;
}

function parseNullableNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseFfprobeProfile(value: unknown): VideoProfile {
  const probe = value && typeof value === "object" ? (value as { format?: Record<string, unknown>; streams?: unknown[] }) : {};
  const streams = Array.isArray(probe.streams) ? probe.streams.filter((stream): stream is Record<string, unknown> => Boolean(stream && typeof stream === "object")) : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const formatName = typeof probe.format?.format_name === "string" ? probe.format.format_name : null;
  const duration = parseNullableNumber(probe.format?.duration ?? video?.duration);
  const bitrate = parseNullableNumber(probe.format?.bit_rate ?? video?.bit_rate);
  const level = parseNullableNumber(video?.level);
  const width = parseNullableNumber(video?.width);
  const height = parseNullableNumber(video?.height);
  const profile = typeof video?.profile === "string" ? video.profile : null;
  const videoCodec = typeof video?.codec_name === "string" ? video.codec_name : null;
  const pixelFormat = typeof video?.pix_fmt === "string" ? video.pix_fmt : null;
  const audioCodec = typeof audio?.codec_name === "string" ? audio.codec_name : null;
  const containerIsMp4 = typeof formatName === "string" && /(^|,)mov,mp4,m4a,3gp,3g2,mj2(,|$)/.test(formatName);
  const piSafe =
    containerIsMp4 &&
    videoCodec === "h264" &&
    pixelFormat === "yuv420p" &&
    (width === null || width <= 1920) &&
    (level === null || level <= 41) &&
    (audioCodec === null || audioCodec === "aac");

  return {
    audioCodec,
    bitrate,
    container: formatName,
    durationSeconds: duration,
    height,
    level,
    piSafe,
    pixelFormat,
    profile,
    videoCodec,
    width
  };
}

async function analyzeVideo(filePath: string): Promise<VideoProfile> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath
  ], {
    maxBuffer: 8 * 1024 * 1024
  });

  return parseFfprobeProfile(JSON.parse(stdout));
}

async function transcodeVideo(inputPath: string, outputPath: string) {
  const pendingPath = `${outputPath}.tmp`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "23",
    "-maxrate",
    "8000k",
    "-bufsize",
    "16000k",
    "-vf",
    "scale=min(1920\\,iw):-2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    pendingPath
  ], {
    maxBuffer: 8 * 1024 * 1024
  });
  await rename(pendingPath, outputPath);
}

async function generateVideoThumbnail(inputPath: string, mediaId: string, durationSeconds?: number | null) {
  await mkdir(thumbnailRoot, { recursive: true });
  const thumbnailFilename = getVideoThumbnailFilename(mediaId);
  const thumbnailPath = getThumbnailPath(thumbnailFilename);
  const pendingPath = `${thumbnailPath}.tmp.jpg`;
  const seekSeconds =
    durationSeconds && Number.isFinite(durationSeconds)
      ? Math.max(0.25, Math.min(1, durationSeconds * 0.1))
      : 1;

  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    seekSeconds.toFixed(2),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-2",
    "-q:v",
    "3",
    pendingPath
  ], {
    maxBuffer: 8 * 1024 * 1024
  });
  await assertNonEmptyFile(pendingPath);
  await rename(pendingPath, thumbnailPath);
  return thumbnailFilename;
}

function isExternalMediaType(type: unknown): type is "web_url" | "rss_feed" {
  return type === "web_url" || type === "rss_feed";
}

function getWebUrlRenderMode(value: unknown): "iframe" | "browser" {
  return value === "browser" ? "browser" : "iframe";
}

function getWebUrlPlaybackMode(value: unknown): "timed" | "persistent" {
  return value === "persistent" ? "persistent" : "timed";
}

function isValidHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeHexColor(value: unknown) {
  return isValidHexColor(value) ? (value as string).trim().toLowerCase() : undefined;
}

function isValidRssTextSize(value: unknown) {
  return typeof value === "string" && rssTextSizePresets.has(value);
}

function normalizeRssTextSize(value: unknown) {
  return isValidRssTextSize(value) ? (value as RssStyle["titleSize"]) : undefined;
}

function normalizeRssStyle(value: unknown): RssStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as RssStyle;
  const style: RssStyle = {
    backgroundColor: normalizeHexColor(candidate.backgroundColor),
    textColor: normalizeHexColor(candidate.textColor),
    titleColor: normalizeHexColor(candidate.titleColor),
    accentColor: normalizeHexColor(candidate.accentColor),
    cardBackgroundColor: normalizeHexColor(candidate.cardBackgroundColor),
    titleSize: normalizeRssTextSize(candidate.titleSize),
    bodySize: normalizeRssTextSize(candidate.bodySize),
    metaSize: normalizeRssTextSize(candidate.metaSize)
  };
  const hasStyleValue = Object.values(style).some((entry) => entry !== undefined);

  return hasStyleValue ? style : undefined;
}

function parseRssStyleInput(value: unknown): RssStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as RssStyle;
  const style: RssStyle = {
    backgroundColor: typeof candidate.backgroundColor === "string" ? candidate.backgroundColor.trim() : undefined,
    textColor: typeof candidate.textColor === "string" ? candidate.textColor.trim() : undefined,
    titleColor: typeof candidate.titleColor === "string" ? candidate.titleColor.trim() : undefined,
    accentColor: typeof candidate.accentColor === "string" ? candidate.accentColor.trim() : undefined,
    cardBackgroundColor: typeof candidate.cardBackgroundColor === "string" ? candidate.cardBackgroundColor.trim() : undefined,
    titleSize: typeof candidate.titleSize === "string" ? candidate.titleSize.trim() as RssStyle["titleSize"] : undefined,
    bodySize: typeof candidate.bodySize === "string" ? candidate.bodySize.trim() as RssStyle["bodySize"] : undefined,
    metaSize: typeof candidate.metaSize === "string" ? candidate.metaSize.trim() as RssStyle["metaSize"] : undefined
  };
  const hasStyleValue = Object.values(style).some((entry) => entry !== undefined);

  return hasStyleValue ? style : undefined;
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

  if (item.type === "rss_feed" && item.rssStyle) {
    for (const [field, value] of Object.entries(item.rssStyle)) {
      if (
        value !== undefined &&
        field !== "titleSize" &&
        field !== "bodySize" &&
        field !== "metaSize" &&
        !isValidHexColor(value)
      ) {
        issues.push({
          ruleId: "VAL-MEDIA-009",
          field: `rssStyle.${field}`,
          severity: "blocking_error",
          message: "RSS style colors must be valid hex colors such as #000000."
        });
      }

      if (
        value !== undefined &&
        (field === "titleSize" || field === "bodySize" || field === "metaSize") &&
        !isValidRssTextSize(value)
      ) {
        issues.push({
          ruleId: "VAL-MEDIA-010",
          field: `rssStyle.${field}`,
          severity: "blocking_error",
          message: "RSS text sizes must be small, normal, large, or extra-large."
        });
      }
    }
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

  if (
    item.type === "web_url" &&
    item.webUrlPlaybackMode !== undefined &&
    item.webUrlPlaybackMode !== "timed" &&
    item.webUrlPlaybackMode !== "persistent"
  ) {
    issues.push({
      ruleId: "VAL-MEDIA-011",
      field: "webUrlPlaybackMode",
      severity: "blocking_error",
      message: "Web URL playback mode must be timed or persistent."
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
      webUrlPlaybackMode: candidate.type === "web_url" ? getWebUrlPlaybackMode(candidate.webUrlPlaybackMode) : undefined,
      webUrlRenderMode: candidate.type === "web_url" ? getWebUrlRenderMode(candidate.webUrlRenderMode) : undefined,
      browserActions: candidate.type === "web_url" ? normalizeBrowserActions(candidate.browserActions) : undefined,
      maxItems: candidate.type === "rss_feed" ? Math.max(Math.min(Number(candidate.maxItems ?? 5), 20), 1) : undefined,
      rssStyle: candidate.type === "rss_feed" ? normalizeRssStyle(candidate.rssStyle) : undefined,
      status: candidate.status === "trashed" ? "trashed" : undefined,
      trashedAt:
        typeof candidate.trashedAt === "string" && candidate.trashedAt.trim()
          ? candidate.trashedAt
          : undefined,
      trashFiles: Array.isArray(candidate.trashFiles)
        ? candidate.trashFiles.filter((filename): filename is string => typeof filename === "string" && Boolean(filename.trim()))
        : undefined,
      thumbnailFilename:
        typeof candidate.thumbnailFilename === "string" && candidate.thumbnailFilename.trim()
          ? candidate.thumbnailFilename
          : undefined
    };
  }

  if (
    typeof candidate.filename !== "string" ||
    (candidate.type !== "image" && candidate.type !== "video")
  ) {
    return null;
  }

  const filename = candidate.filename;
  const processingStatus =
    candidate.processingStatus === "uploaded" ||
    candidate.processingStatus === "analyzing" ||
    candidate.processingStatus === "processing" ||
    candidate.processingStatus === "ready" ||
    candidate.processingStatus === "failed"
      ? candidate.processingStatus
      : undefined;

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
    size: typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : 0,
    originalFilename:
      typeof candidate.originalFilename === "string" && candidate.originalFilename.trim()
        ? candidate.originalFilename
        : undefined,
    playbackFilename:
      typeof candidate.playbackFilename === "string" && candidate.playbackFilename.trim()
        ? candidate.playbackFilename
        : undefined,
    processedAt:
      typeof candidate.processedAt === "string" && candidate.processedAt.trim()
        ? candidate.processedAt
        : undefined,
    processingError:
      typeof candidate.processingError === "string" && candidate.processingError.trim()
        ? candidate.processingError
        : undefined,
    processingStatus,
    status: candidate.status === "trashed" ? "trashed" : undefined,
    trashedAt:
      typeof candidate.trashedAt === "string" && candidate.trashedAt.trim()
        ? candidate.trashedAt
        : undefined,
    trashFiles: Array.isArray(candidate.trashFiles)
      ? candidate.trashFiles.filter((filename): filename is string => typeof filename === "string" && Boolean(filename.trim()))
      : undefined,
    thumbnailFilename:
      typeof candidate.thumbnailFilename === "string" && candidate.thumbnailFilename.trim()
        ? candidate.thumbnailFilename
        : undefined,
    videoProfile:
      candidate.videoProfile && typeof candidate.videoProfile === "object"
        ? (candidate.videoProfile as VideoProfile)
        : undefined
  };
}

async function readMetadataFile(): Promise<MediaItem[]> {
  try {
    const content = await readFile(metadataPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value.flatMap((item): MediaItem[] => {
        try {
          const normalizedItem = normalizeMetadataItem(item);
          return normalizedItem ? [normalizedItem] : [];
        } catch (error) {
          console.warn("invalid media metadata item ignored", {
            error: error instanceof Error ? error.message : String(error)
          });
          return [];
        }
      });
    }
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") {
      return [];
    }

    console.warn("media metadata could not be loaded", {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }

  return [];
}

async function writeMetadataFile(items: MediaItem[]) {
  validateMediaCollection(items);
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  const metadataTempPath = resolve(process.cwd(), "data", `media.${process.pid}.${Date.now()}.${randomUUID()}.json.tmp`);
  await writeFile(metadataTempPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await rename(metadataTempPath, metadataPath);
}

async function updateMediaItem(mediaId: string, patch: Partial<MediaItem>) {
  const items = await readMetadataFile();
  const index = items.findIndex((item) => item.mediaId === mediaId);

  if (index === -1) {
    return null;
  }

  const nextItem = {
    ...items[index],
    ...patch
  };
  const nextItems = [...items];
  nextItems[index] = nextItem;
  await writeMetadataFile(nextItems);
  return nextItem;
}

async function fileExists(filename: string) {
  try {
    await access(getMediaPath(filename));
    return true;
  } catch {
    return false;
  }
}

async function removeFileIfPresent(filename: string) {
  try {
    await unlink(getMediaPath(filename));
  } catch {
    // Temporary cleanup is best effort.
  }
}

async function removeThumbnailIfPresent(filename: string) {
  try {
    await unlink(getThumbnailPath(filename));
  } catch {
    // Thumbnail cleanup is best effort.
  }
}

async function assertNonEmptyFile(filePath: string) {
  const fileStat = await stat(filePath);

  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error("normalized video output was empty");
  }

  return fileStat;
}

async function processVideo(job: VideoProcessingJob) {
  const items = await readMetadataFile();
  const item = items.find((candidate) => candidate.mediaId === job.mediaId);

  if (!item || item.type !== "video") {
    return;
  }

  const mediaId = job.mediaId;
  const sourceFilename = job.uploadFilename ?? item.filename;
  const sourcePath = getMediaPath(sourceFilename);
  const normalizedTempFilename = createNormalizedTempFilename(item.filename, mediaId);
  const normalizedTempPath = getMediaPath(normalizedTempFilename);
  const finalPath = getMediaPath(item.filename);
  const finalExistedBefore = await fileExists(item.filename);
  let uploadSourcePreservedForRetry = false;

  try {
    console.log("video normalization analyzing", { filename: sourceFilename, mediaId });
    await updateMediaItem(mediaId, {
      originalFilename: undefined,
      playbackFilename: undefined,
      processingError: undefined,
      processingStatus: "analyzing"
    });
    const profile = await analyzeVideo(sourcePath);

    console.log("video normalization transcoding", {
      filename: sourceFilename,
      mediaId,
      outputFilename: item.filename,
      probePiSafe: profile.piSafe
    });
    await updateMediaItem(mediaId, {
      originalFilename: undefined,
      playbackFilename: undefined,
      processingError: undefined,
      processingStatus: "processing",
      videoProfile: profile
    });
    await transcodeVideo(sourcePath, normalizedTempPath);
    await assertNonEmptyFile(normalizedTempPath);
    await rename(normalizedTempPath, finalPath);
    const [normalizedProfile, finalStat] = await Promise.all([
      analyzeVideo(finalPath),
      assertNonEmptyFile(finalPath)
    ]);
    let thumbnailFilename: string | undefined;

    try {
      thumbnailFilename = await generateVideoThumbnail(finalPath, mediaId, normalizedProfile.durationSeconds);
    } catch (thumbnailError) {
      console.warn("video thumbnail generation failed", {
        error: thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError),
        filename: item.filename,
        mediaId
      });
    }

    await updateMediaItem(mediaId, {
      originalFilename: undefined,
      playbackFilename: undefined,
      processedAt: new Date().toISOString(),
      processingError: undefined,
      processingStatus: "ready",
      size: finalStat.size,
      thumbnailFilename,
      videoProfile: normalizedProfile
    });
    console.log("video normalization complete", { filename: sourceFilename, mediaId, outputFilename: item.filename });
  } catch (error) {
    let failedSize = item.size;

    if (job.uploadFilename && !finalExistedBefore) {
      try {
        await rename(sourcePath, finalPath);
        const failedSourceStat = await stat(finalPath);
        failedSize = failedSourceStat.size;
        uploadSourcePreservedForRetry = true;
      } catch {
        // If preserving the failed upload is impossible, the error below remains authoritative.
      }
    }

    console.error("video normalization failed", {
      error: error instanceof Error ? error.message : String(error),
      filename: sourceFilename,
      mediaId
    });
    await updateMediaItem(mediaId, {
      playbackFilename: undefined,
      processedAt: new Date().toISOString(),
      processingError: error instanceof Error ? error.message : String(error),
      processingStatus: "failed",
      size: failedSize
    });
  } finally {
    if (job.uploadFilename && !uploadSourcePreservedForRetry) {
      await removeFileIfPresent(job.uploadFilename);
    }

    await removeFileIfPresent(normalizedTempFilename);
    await removeFileIfPresent(`${normalizedTempFilename}.tmp`);
  }
}

function enqueueVideoProcessing(job: VideoProcessingJob) {
  if (!videoProcessingQueue.some((queuedJob) => queuedJob.mediaId === job.mediaId)) {
    videoProcessingQueue.push(job);
  }

  void drainVideoProcessingQueue();
}

async function drainVideoProcessingQueue() {
  if (videoProcessingActive) {
    return;
  }

  videoProcessingActive = true;

  try {
    while (videoProcessingQueue.length > 0) {
      const job = videoProcessingQueue.shift();

      if (job) {
        await processVideo(job);
      }
    }
  } finally {
    videoProcessingActive = false;
  }
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

function createUniqueMediaId(items: MediaItem[]) {
  const usedMediaIds = new Set(items.map((item) => item.mediaId));
  let mediaId = createStableMediaId();

  while (usedMediaIds.has(mediaId)) {
    mediaId = createStableMediaId();
  }

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
    size: fileStat.size,
    originalFilename: existingItem?.originalFilename,
    playbackFilename: existingItem?.playbackFilename,
    processedAt: existingItem?.processedAt,
    processingError: existingItem?.processingError,
    processingStatus: existingItem?.processingStatus,
    thumbnailFilename: existingItem?.thumbnailFilename,
    videoProfile: existingItem?.videoProfile
  };
}

export async function listMedia(): Promise<MediaItem[]> {
  await mkdir(mediaRoot, { recursive: true });

  const [filenames, metadata] = await Promise.all([
    readdir(mediaRoot),
    readMetadataFile()
  ]);
  const activeMetadata = metadata.filter((item) => item.status !== "trashed");
  const externalItems = activeMetadata.filter((item) => item.type === "web_url" || item.type === "rss_feed");
  const metadataByFilename = new Map(
    activeMetadata
      .filter((item) => item.type === "image" || item.type === "video")
      .map((item) => [item.filename, item])
  );
  const playbackAssets = new Set(
    activeMetadata
      .filter((item) => item.type === "video" && item.playbackFilename && item.playbackFilename !== item.filename)
      .map((item) => item.playbackFilename as string)
  );
  const usedMediaIds = new Set<string>();
  const fileItems = (
    await Promise.all(
      filenames
        .filter((filename) => !isTemporaryMediaFilename(filename))
        .filter((filename) => !isLegacyNormalizedMediaFilename(filename))
        .filter((filename) => !playbackAssets.has(filename))
        .map((filename) => itemFromFile(filename, metadataByFilename.get(filename), usedMediaIds))
    )
  )
    .filter((item): item is MediaItem => item !== null)
    .sort((first, second) => first.filename.localeCompare(second.filename));
  const fileItemNames = new Set(fileItems.map((item) => item.filename));
  const metadataOnlyFileItems = activeMetadata.filter(
    (item) =>
      (item.type === "image" || item.type === "video") &&
      !fileItemNames.has(item.filename) &&
      (item.processingStatus === "uploaded" ||
        item.processingStatus === "analyzing" ||
        item.processingStatus === "processing" ||
        item.processingStatus === "failed")
  );
  const items = [...fileItems, ...metadataOnlyFileItems, ...externalItems].sort((first, second) =>
    (first.title ?? first.filename).localeCompare(second.title ?? second.filename)
  );

  return items;
}

export async function listTrashedMedia(): Promise<MediaItem[]> {
  const items = await readMetadataFile();

  return items
    .filter((item) => item.status === "trashed")
    .sort((first, second) =>
      (second.trashedAt ?? "").localeCompare(first.trashedAt ?? "") ||
      (first.title ?? first.filename).localeCompare(second.title ?? second.filename)
    );
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

  if (mediaType === "image") {
    const filePath = getMediaPath(safeFilename);
    await writeFile(filePath, content);
    const fileStat = await stat(filePath);
    const items = await listMedia();
    const existingItem = items.find((mediaItem) => mediaItem.filename === safeFilename);
    const mediaId = existingItem?.mediaId ?? createUniqueMediaId(items);
    const readyImage: MediaItem = {
      id: existingItem?.id ?? toLegacyMediaId(safeFilename),
      mediaId,
      filename: safeFilename,
      type: "image",
      size: fileStat.size,
      processingStatus: "ready"
    };
    const nextItems = existingItem
      ? items.map((item) => (item.mediaId === mediaId ? readyImage : item))
      : [...items, readyImage];

    await writeMetadataFile(nextItems);
    return readyImage;
  }

  const items = await listMedia();
  const existingItem = items.find((mediaItem) => mediaItem.filename === safeFilename);
  const mediaId = existingItem?.mediaId ?? createUniqueMediaId(items);
  const uploadTempFilename = createUploadTempFilename(safeFilename, mediaId);
  const uploadTempPath = getMediaPath(uploadTempFilename);
  await writeFile(uploadTempPath, content);

  const queuedVideo: MediaItem = {
    id: existingItem?.id ?? toLegacyMediaId(safeFilename),
    mediaId,
    filename: safeFilename,
    type: "video",
    size: existingItem?.size ?? content.length,
    title: existingItem?.title,
    url: existingItem?.url,
    duration: existingItem?.duration,
    maxItems: existingItem?.maxItems,
    webUrlRenderMode: existingItem?.webUrlRenderMode,
    browserActions: existingItem?.browserActions,
    originalFilename: undefined,
    playbackFilename: undefined,
    processedAt: undefined,
    processingError: undefined,
    processingStatus: "uploaded",
    thumbnailFilename: existingItem?.thumbnailFilename,
    videoProfile: undefined
  };
  const nextItems = existingItem
    ? items.map((item) => (item.mediaId === mediaId ? queuedVideo : item))
    : [...items, queuedVideo];

  await writeMetadataFile(nextItems);
  enqueueVideoProcessing({ mediaId, uploadFilename: uploadTempFilename });
  return queuedVideo;
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
  const webUrlPlaybackMode = externalType === "web_url" ? getWebUrlPlaybackMode(candidate.webUrlPlaybackMode) : undefined;
  const maxItems = externalType === "rss_feed" ? Math.max(Math.min(Number(candidate.maxItems ?? 5), 20), 1) : undefined;
  const rssStyle = externalType === "rss_feed" ? parseRssStyleInput(candidate.rssStyle) : undefined;
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
    webUrlPlaybackMode,
    webUrlRenderMode,
    browserActions,
    maxItems,
    rssStyle
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
  const webUrlPlaybackMode = existingItem.type === "web_url"
    ? getWebUrlPlaybackMode(candidate.webUrlPlaybackMode ?? existingItem.webUrlPlaybackMode)
    : undefined;
  const maxItems = existingItem.type === "rss_feed"
    ? Math.max(Math.min(Number(candidate.maxItems ?? existingItem.maxItems ?? 5), 20), 1)
    : undefined;
  const rssStyle = existingItem.type === "rss_feed"
    ? parseRssStyleInput(candidate.rssStyle ?? existingItem.rssStyle)
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
    webUrlPlaybackMode,
    maxItems,
    rssStyle,
    webUrlRenderMode,
    browserActions
  };

  assertValid(validateMediaItem(updatedItem));
  const updatedItems = [...items];
  updatedItems[index] = updatedItem;
  await writeMetadataFile(updatedItems);
  return updatedItem;
}

export async function retryVideoNormalization(id: string): Promise<MediaItem | null> {
  const items = await listMedia();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item) {
    return null;
  }

  if (item.type !== "video" || item.processingStatus !== "failed") {
    assertValid([
      {
        ruleId: "VAL-MEDIA-007",
        field: "processingStatus",
        severity: "blocking_error",
        message: "Only failed video normalization can be retried."
      }
    ]);
  }

  if (!(await fileExists(item.filename))) {
    assertValid([
      {
        ruleId: "VAL-MEDIA-008",
        field: "filename",
        severity: "blocking_error",
        message: "The uploaded video file is no longer available for retry."
      }
    ]);
  }

  const queuedItem = await updateMediaItem(item.mediaId, {
    originalFilename: undefined,
    playbackFilename: undefined,
    processedAt: undefined,
    processingError: undefined,
    processingStatus: "uploaded"
  });

  enqueueVideoProcessing({ mediaId: item.mediaId });
  return queuedItem ?? item;
}

export async function cleanupTemporaryMediaFiles() {
  await mkdir(mediaRoot, { recursive: true });
  await mkdir(thumbnailRoot, { recursive: true });
  const [filenames, metadata] = await Promise.all([
    readdir(mediaRoot),
    readMetadataFile()
  ]);
  const metadataByMediaId = new Map(metadata.map((item) => [item.mediaId, item]));

  for (const filename of filenames) {
    if (filename.includes(".normalized.tmp.")) {
      await removeFileIfPresent(filename);
      continue;
    }

    if (!filename.endsWith(".upload.tmp")) {
      continue;
    }

    const mediaId = getMediaIdFromUploadTempFilename(filename);
    const item = mediaId ? metadataByMediaId.get(mediaId) : undefined;

    if (!item || item.type !== "video") {
      await removeFileIfPresent(filename);
      continue;
    }

    if (!(await fileExists(item.filename))) {
      try {
        await rename(getMediaPath(filename), getMediaPath(item.filename));
        const fileStat = await stat(getMediaPath(item.filename));
        await updateMediaItem(item.mediaId, {
          originalFilename: undefined,
          playbackFilename: undefined,
          processedAt: new Date().toISOString(),
          processingError: "Video normalization was interrupted before completion. Retry normalization to prepare this video.",
          processingStatus: "failed",
          size: fileStat.size
        });
        continue;
      } catch {
        // Fall through to temp cleanup if the interrupted upload cannot be preserved.
      }
    }

    await removeFileIfPresent(filename);
  }

  const thumbnailFilenames = await readdir(thumbnailRoot);

  for (const filename of thumbnailFilenames) {
    if (filename.endsWith(".tmp.jpg")) {
      await removeThumbnailIfPresent(filename);
    }
  }
}

function getMediaFileBackedFilenames(item: MediaItem) {
  return Array.from(
    new Set([item.filename, item.originalFilename, item.playbackFilename].filter((value): value is string => Boolean(value)))
  );
}

async function moveFileToTrash(mediaId: string, filename: string) {
  const sourcePath = getMediaPath(filename);
  const trashPath = getMediaTrashPath(mediaId, filename);

  try {
    await access(sourcePath);
  } catch {
    return false;
  }

  await mkdir(dirname(trashPath), { recursive: true });
  await rename(sourcePath, trashPath);
  return true;
}

async function restoreFileFromTrash(mediaId: string, filename: string) {
  const activePath = getMediaPath(filename);
  const trashPath = getMediaTrashPath(mediaId, filename);

  try {
    await access(activePath);
    throw new Error(`active media file already exists: ${filename}`);
  } catch (error) {
    if ((error as { code?: string })?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(dirname(activePath), { recursive: true });
  await rename(trashPath, activePath);
}

export async function moveMediaToTrash(id: string): Promise<MediaItem | null> {
  const items = await readMetadataFile();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item || item.status === "trashed") {
    return null;
  }

  const trashFiles: string[] = [];

  if (item.type === "image" || item.type === "video") {
    for (const filename of getMediaFileBackedFilenames(item)) {
      if (await moveFileToTrash(item.mediaId, filename)) {
        trashFiles.push(filename);
      }
    }
  }

  const trashedItem: MediaItem = {
    ...item,
    status: "trashed",
    trashedAt: new Date().toISOString(),
    trashFiles: trashFiles.length > 0 ? trashFiles : item.trashFiles
  };

  await writeMetadataFile(items.map((mediaItem) => (mediaItem.mediaId === item.mediaId ? trashedItem : mediaItem)));
  return trashedItem;
}

export async function restoreMediaFromTrash(id: string): Promise<MediaItem | null> {
  const items = await readMetadataFile();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item || item.status !== "trashed") {
    return null;
  }

  if (item.type === "image" || item.type === "video") {
    const filenames = item.trashFiles && item.trashFiles.length > 0 ? item.trashFiles : getMediaFileBackedFilenames(item);

    for (const filename of filenames) {
      await restoreFileFromTrash(item.mediaId, filename);
    }
  }

  const restoredItem: MediaItem = {
    ...item,
    status: undefined,
    trashedAt: undefined,
    trashFiles: undefined
  };

  await writeMetadataFile(items.map((mediaItem) => (mediaItem.mediaId === item.mediaId ? restoredItem : mediaItem)));
  return restoredItem;
}

export async function deleteTrashedMediaPermanently(id: string): Promise<boolean> {
  const items = await readMetadataFile();
  const item = items.find((mediaItem) => mediaItem.id === id || mediaItem.mediaId === id);

  if (!item || item.status !== "trashed") {
    return false;
  }

  await rm(resolve(mediaTrashRoot, item.mediaId.replace(/[^a-zA-Z0-9_-]+/g, "-")), {
    force: true,
    recursive: true
  });
  if (item.thumbnailFilename) {
    await removeThumbnailIfPresent(item.thumbnailFilename);
  }
  await writeMetadataFile(items.filter((mediaItem) => mediaItem.mediaId !== item.mediaId));
  return true;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const item = await moveMediaToTrash(id);
  return Boolean(item);
}
