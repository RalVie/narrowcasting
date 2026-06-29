import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  listMedia,
  resolveMediaReferenceFromList,
  type MediaItem
} from "../media/mediaStore.js";

export type ThemeOrientation = "landscape" | "portrait";
export type ThemeRegionType = "program" | "logo" | "image" | "text" | "clock";
export type ThemeObjectFit = "contain" | "cover" | "stretch" | "center";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeClockFormat = "HH:mm" | "HH:mm:ss" | "dd-MM-yyyy HH:mm";

export interface ThemeRegion {
  id: string;
  name: string;
  type: ThemeRegionType;
  x: number;
  y: number;
  width: number;
  height: number;
  mediaId?: string;
  file?: string;
  objectFit?: ThemeObjectFit;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  text?: string;
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: ThemeTextAlign;
  textColor?: string;
  backgroundColor?: string;
  padding?: number;
  cornerRadius?: number;
  clockFormat?: ThemeClockFormat;
}

export interface Theme {
  id: string;
  name: string;
  orientation: ThemeOrientation;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundMediaId?: string;
  regions: ThemeRegion[];
  options?: Record<string, unknown>;
}

const themesPath = resolve(process.cwd(), "data", "themes.json");
const defaultThemeId = "default-fullscreen";
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const transparentColor = "transparent";
const allowedRegionTypes = new Set<ThemeRegionType>(["program", "logo", "image", "text", "clock"]);
const allowedObjectFits = new Set<ThemeObjectFit>(["contain", "cover", "stretch", "center"]);
const allowedTextAlignments = new Set<ThemeTextAlign>(["left", "center", "right"]);
const allowedClockFormats = new Set<ThemeClockFormat>(["HH:mm", "HH:mm:ss", "dd-MM-yyyy HH:mm"]);

export const defaultTheme: Theme = {
  id: defaultThemeId,
  name: "Default Fullscreen",
  orientation: "landscape",
  canvasWidth: 1920,
  canvasHeight: 1080,
  backgroundColor: "#000000",
  regions: [
    {
      id: "main-program",
      name: "Main Content",
      type: "program",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    }
  ]
};

function toThemeId(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `theme-${Date.now()}`;
}

function toPositiveNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function toNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toOpacity(value: unknown) {
  return Math.min(Math.max(toNumber(value, 1), 0), 1);
}

function normalizeColor(value: unknown, fallback?: string) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === transparentColor) {
      return transparentColor;
    }

    if (colorPattern.test(value)) {
      return value;
    }
  }

  return fallback;
}

function normalizeRegion(value: unknown, index: number, mediaItems: MediaItem[] = []): ThemeRegion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ThemeRegion>;
  const type = allowedRegionTypes.has(candidate.type as ThemeRegionType)
    ? (candidate.type as ThemeRegionType)
    : "program";
  const objectFit = allowedObjectFits.has(candidate.objectFit as ThemeObjectFit)
    ? (candidate.objectFit as ThemeObjectFit)
    : undefined;
  const align = allowedTextAlignments.has(candidate.align as ThemeTextAlign)
    ? (candidate.align as ThemeTextAlign)
    : undefined;
  const clockFormat = allowedClockFormats.has(candidate.clockFormat as ThemeClockFormat)
    ? (candidate.clockFormat as ThemeClockFormat)
    : undefined;
  const referencedMedia =
    type === "logo" || type === "image"
      ? resolveMediaReferenceFromList(mediaItems, candidate.mediaId) ??
        resolveMediaReferenceFromList(mediaItems, candidate.file)
      : null;

  return {
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `region-${index + 1}`,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : `Region ${index + 1}`,
    type,
    x: toNumber(candidate.x, 0),
    y: toNumber(candidate.y, 0),
    width: toPositiveNumber(candidate.width, defaultTheme.canvasWidth),
    height: toPositiveNumber(candidate.height, defaultTheme.canvasHeight),
    mediaId: referencedMedia?.mediaId ?? toOptionalString(candidate.mediaId),
    file: referencedMedia?.filename ?? toOptionalString(candidate.file),
    objectFit,
    opacity: toOpacity(candidate.opacity),
    visible: toBoolean(candidate.visible, true),
    locked: toBoolean(candidate.locked, false),
    text: typeof candidate.text === "string" ? candidate.text : undefined,
    font: toOptionalString(candidate.font),
    fontSize: toPositiveNumber(candidate.fontSize, 48),
    bold: toBoolean(candidate.bold, false),
    italic: toBoolean(candidate.italic, false),
    align,
    textColor: normalizeColor(candidate.textColor),
    backgroundColor: normalizeColor(candidate.backgroundColor),
    padding: Math.max(toNumber(candidate.padding, 0), 0),
    cornerRadius: Math.max(toNumber(candidate.cornerRadius, 0), 0),
    clockFormat
  };
}

function normalizeTheme(value: unknown, fallbackIndex: number, mediaItems: MediaItem[] = []): Theme | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Theme>;
  const name =
    typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : fallbackIndex === 0
        ? defaultTheme.name
        : `Theme ${fallbackIndex + 1}`;
  const canvasWidth = toPositiveNumber(candidate.canvasWidth, defaultTheme.canvasWidth);
  const canvasHeight = toPositiveNumber(candidate.canvasHeight, defaultTheme.canvasHeight);
  const regions = Array.isArray(candidate.regions)
    ? candidate.regions
        .map((region, index) => normalizeRegion(region, index, mediaItems))
        .filter((region): region is ThemeRegion => region !== null)
    : [];
  const backgroundMedia = resolveMediaReferenceFromList(mediaItems, candidate.backgroundMediaId);

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? toThemeId(candidate.id)
        : fallbackIndex === 0
          ? defaultThemeId
          : toThemeId(name),
    name,
    orientation: candidate.orientation === "portrait" ? "portrait" : "landscape",
    canvasWidth,
    canvasHeight,
    backgroundColor: normalizeColor(candidate.backgroundColor, defaultTheme.backgroundColor) ?? defaultTheme.backgroundColor,
    backgroundMediaId:
      backgroundMedia?.mediaId ??
      (typeof candidate.backgroundMediaId === "string" && candidate.backgroundMediaId.trim()
        ? candidate.backgroundMediaId.trim()
        : undefined),
    regions:
      regions.length > 0
        ? regions
        : [
            {
              ...defaultTheme.regions[0],
              width: canvasWidth,
              height: canvasHeight
            }
          ],
    options: candidate.options && typeof candidate.options === "object" ? candidate.options : undefined
  };
}

async function writeThemes(themes: Theme[]) {
  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(themesPath, `${JSON.stringify(themes, null, 2)}\n`, "utf8");
}

export async function listThemes(): Promise<Theme[]> {
  const mediaItems = await listMedia();

  try {
    const content = await readFile(themesPath, "utf8");
    const value: unknown = JSON.parse(content);

    if (Array.isArray(value)) {
      const themes = value
        .map((theme, index) => normalizeTheme(theme, index, mediaItems))
        .filter((theme): theme is Theme => theme !== null);

      if (themes.length > 0) {
        return themes.some((theme) => theme.id === defaultThemeId) ? themes : [defaultTheme, ...themes];
      }
    }
  } catch {
    return [defaultTheme];
  }

  return [defaultTheme];
}

export async function getThemeOrDefault(themeId?: string): Promise<Theme> {
  const themes = await listThemes();
  return themes.find((theme) => theme.id === themeId) ?? themes.find((theme) => theme.id === defaultThemeId) ?? defaultTheme;
}

export async function createTheme(value: unknown): Promise<Theme> {
  const themes = await listThemes();
  const mediaItems = await listMedia();
  const incoming = value as Partial<Theme>;
  const name = typeof incoming.name === "string" && incoming.name.trim() ? incoming.name.trim() : "New Theme";
  const baseId = toThemeId(typeof incoming.id === "string" ? incoming.id : name);
  const existingIds = new Set(themes.map((theme) => theme.id));
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const theme = normalizeTheme({ ...defaultTheme, ...incoming, id, name }, themes.length, mediaItems) ?? {
    ...defaultTheme,
    id,
    name
  };

  await writeThemes([...themes, theme]);
  return theme;
}

export async function saveTheme(id: string, value: unknown): Promise<Theme | null> {
  const themes = await listThemes();
  const mediaItems = await listMedia();
  const existingTheme = themes.find((theme) => theme.id === id);

  if (!existingTheme) {
    return null;
  }

  const theme = normalizeTheme({ ...existingTheme, ...(value as Partial<Theme>), id: existingTheme.id }, 0, mediaItems);

  if (!theme) {
    return null;
  }

  await writeThemes(themes.map((item) => (item.id === id ? theme : item)));
  return theme;
}

export async function deleteTheme(id: string): Promise<boolean> {
  if (id === defaultThemeId) {
    return false;
  }

  const themes = await listThemes();
  const nextThemes = themes.filter((theme) => theme.id !== id);

  if (nextThemes.length === themes.length) {
    return false;
  }

  await writeThemes(nextThemes);
  return true;
}
