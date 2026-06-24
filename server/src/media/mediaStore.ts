import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export interface MediaItem {
  id: string;
  filename: string;
  type: "image" | "video";
  size: number;
}

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

function toMediaId(filename: string) {
  const extension = extname(filename).toLowerCase().replace(".", "");
  const baseId = basename(filename, extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");

  if (extension === "jpg" || extension === "jpeg") {
    return baseId;
  }

  return `${baseId}-${extension}`;
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

async function readMetadataFile(): Promise<MediaItem[]> {
  try {
    const content = await readFile(metadataPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      return value.filter((item): item is MediaItem => {
        const candidate = item as Partial<MediaItem>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.filename === "string" &&
          (candidate.type === "image" || candidate.type === "video") &&
          typeof candidate.size === "number"
        );
      });
    }
  } catch {
    return [];
  }

  return [];
}

async function writeMetadataFile(items: MediaItem[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

async function itemFromFile(filename: string): Promise<MediaItem | null> {
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
    id: toMediaId(filename),
    filename,
    type: mediaType,
    size: fileStat.size
  };
}

export async function listMedia(): Promise<MediaItem[]> {
  await mkdir(mediaRoot, { recursive: true });

  const filenames = await readdir(mediaRoot);
  const items = (
    await Promise.all(filenames.map((filename) => itemFromFile(filename)))
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
    throw new Error("only jpg, jpeg, png, webp, mp4, and webm media files are supported");
  }

  await mkdir(mediaRoot, { recursive: true });
  const filePath = getMediaPath(safeFilename);
  await writeFile(filePath, content);

  const fileStat = await stat(filePath);
  const item: MediaItem = {
    id: toMediaId(safeFilename),
    filename: safeFilename,
    type: mediaType,
    size: fileStat.size
  };

  const items = (await listMedia()).filter((existingItem) => existingItem.id !== item.id);
  items.push(item);
  await writeMetadataFile(
    items.sort((first, second) => first.filename.localeCompare(second.filename))
  );

  return item;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const items = await listMedia();
  const item = items.find((mediaItem) => mediaItem.id === id);

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

  await writeMetadataFile(items.filter((mediaItem) => mediaItem.id !== id));
  return true;
}
