import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { MediaItem } from "../mediaTypes";
import type { Theme, ThemeClockFormat, ThemeRegion, ThemeRegionType, ThemeTextAlign } from "../themeTypes";

const refreshIntervalMs = 10_000;
const defaultThemeId = "default-fullscreen";
const minimumRegionSize = 40;
const defaultSafeArea = 80;
const resizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const addableRegionTypes: Array<{ label: string; type: ThemeRegionType }> = [
  { label: "Main Content", type: "program" },
  { label: "Logo", type: "logo" },
  { label: "Image", type: "image" },
  { label: "Text", type: "text" },
  { label: "Clock", type: "clock" },
  { label: "RSS", type: "rss" }
];
const regionColors: Record<string, { color: string; background: string }> = {
  program: { color: "#30b56a", background: "rgb(48 181 106 / 28%)" },
  logo: { color: "#4777d9", background: "rgb(71 119 217 / 26%)" },
  clock: { color: "#8a5cf6", background: "rgb(138 92 246 / 26%)" },
  ticker: { color: "#d6b21f", background: "rgb(214 178 31 / 28%)" },
  weather: { color: "#19aebd", background: "rgb(25 174 189 / 26%)" },
  rss: { color: "#ef8a24", background: "rgb(239 138 36 / 26%)" },
  emergency: { color: "#d94343", background: "rgb(217 67 67 / 28%)" }
};
const textAlignOptions: ThemeTextAlign[] = ["left", "center", "right"];
const clockFormatOptions: ThemeClockFormat[] = ["HH:mm", "HH:mm:ss", "dd-MM-yyyy HH:mm"];
const supportedThemeImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
type ViewMode = "library" | "editor";
type PendingNavigation =
  | { type: "back" }
  | {
      type: "open";
      theme: Theme;
    };

type ResizeHandle = (typeof resizeHandles)[number];
type Interaction =
  | {
      mode: "move";
      pointerX: number;
      pointerY: number;
      region: ThemeRegion;
    }
  | {
      mode: "resize";
      handle: ResizeHandle;
      pointerX: number;
      pointerY: number;
      region: ThemeRegion;
    };

function defaultRegion(theme: Theme): ThemeRegion {
  return (
    theme.regions.find((region) => region.type === "program") ?? {
      id: "main-program",
      name: "Main Content",
      type: "program",
      x: 0,
      y: 0,
      width: theme.canvasWidth,
      height: theme.canvasHeight,
      visible: true,
      locked: false,
      opacity: 1
    }
  );
}

function getDefaultRegionName(type: ThemeRegionType, count: number) {
  const label =
    type === "program"
      ? "Main Content"
      : type === "logo"
        ? "Logo"
        : type === "image"
          ? "Image"
          : type === "clock"
            ? "Clock"
            : type === "rss"
              ? "RSS"
              : "Text";
  return count === 0 ? label : `${label} ${count + 1}`;
}

function getRegionTypeLabel(type: ThemeRegionType) {
  return addableRegionTypes.find((item) => item.type === type)?.label ?? type;
}

function createRegion(type: ThemeRegionType, theme: Theme, gridSize: number, snapToGrid: boolean): ThemeRegion {
  const count = theme.regions.filter((region) => region.type === type).length;
  const baseSize = type === "logo" ? 240 : type === "text" || type === "clock" ? 520 : 960;
  const baseHeight = type === "logo" ? 160 : type === "text" || type === "clock" ? 180 : 540;

  return {
    id: `${type}-region-${Date.now()}`,
    name: getDefaultRegionName(type, count),
    type,
    x: snapValue(80 + theme.regions.length * 30, snapToGrid, gridSize),
    y: snapValue(80 + theme.regions.length * 30, snapToGrid, gridSize),
    width: Math.min(baseSize, theme.canvasWidth),
    height: Math.min(baseHeight, theme.canvasHeight),
    objectFit: type === "image" || type === "logo" ? "contain" : undefined,
    opacity: 1,
    visible: true,
    locked: false,
    text: type === "text" ? "Static text" : undefined,
    font: type === "text" || type === "clock" ? "Inter" : undefined,
    fontSize: type === "text" || type === "clock" ? 64 : undefined,
    align: type === "text" || type === "clock" ? "center" : undefined,
    textColor: type === "text" || type === "clock" ? "#ffffff" : undefined,
    backgroundColor: type === "text" || type === "clock" ? "#000000" : undefined,
    padding: type === "text" || type === "clock" ? 24 : undefined,
    cornerRadius: type === "text" || type === "clock" ? 8 : 0,
    clockFormat: type === "clock" ? "HH:mm" : undefined
  };
}

function formatClock(date: Date, format: ThemeClockFormat = "HH:mm") {
  const twoDigit = (value: number) => String(value).padStart(2, "0");
  const hours = twoDigit(date.getHours());
  const minutes = twoDigit(date.getMinutes());
  const seconds = twoDigit(date.getSeconds());
  const day = twoDigit(date.getDate());
  const month = twoDigit(date.getMonth() + 1);
  const year = date.getFullYear();

  if (format === "HH:mm:ss") {
    return `${hours}:${minutes}:${seconds}`;
  }

  if (format === "dd-MM-yyyy HH:mm") {
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }

  return `${hours}:${minutes}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapValue(value: number, enabled: boolean, gridSize: number) {
  return enabled ? Math.round(value / gridSize) * gridSize : Math.round(value);
}

function getPointerPosition(event: PointerEvent<HTMLElement>, canvasElement: HTMLElement, theme: Theme) {
  const rect = canvasElement.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * theme.canvasWidth,
    y: ((event.clientY - rect.top) / rect.height) * theme.canvasHeight
  };
}

function isSupportedThemeImage(item: MediaItem) {
  const extension = item.filename.split(".").pop()?.toLowerCase();
  return item.type === "image" && extension !== undefined && supportedThemeImageExtensions.has(extension);
}

function isTransparentColor(value: string | undefined) {
  return value?.toLowerCase() === "transparent";
}

function getColorInputValue(value: string | undefined, fallback = "#000000") {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function formatUpdatedAt(value?: string) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function ColorControl({
  allowTransparent = false,
  fallback = "#000000",
  label,
  onChange,
  value
}: {
  allowTransparent?: boolean;
  fallback?: string;
  label: string;
  onChange: (value: string) => void;
  value: string | undefined;
}) {
  const transparent = isTransparentColor(value);
  const colorValue = getColorInputValue(value, fallback);

  return (
    <label className="theme-color-control">
      {label}
      <span className="theme-color-row">
        <span
          aria-hidden="true"
          className={transparent ? "theme-color-swatch transparent" : "theme-color-swatch"}
          style={transparent ? undefined : { backgroundColor: colorValue }}
        />
        <input onChange={(event) => onChange(event.target.value)} type="color" value={colorValue} />
      </span>
      <span className="theme-color-value">{transparent ? "Transparent" : colorValue}</span>
      {allowTransparent ? (
        <button onClick={() => onChange("transparent")} type="button">
          Transparent
        </button>
      ) : null}
    </label>
  );
}

export function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [selectedThemeId, setSelectedThemeId] = useState(defaultThemeId);
  const [theme, setTheme] = useState<Theme>({
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
        height: 1080,
        visible: true,
        locked: false,
        opacity: 1
      }
    ]
  });
  const [status, setStatus] = useState("Loading themes...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [renameTarget, setRenameTarget] = useState<Theme | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Theme | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState("main-program");
  const [isInteracting, setIsInteracting] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  const selectedThemeIdRef = useRef(defaultThemeId);
  const selectedRegionIdRef = useRef("main-program");
  const isDirtyRef = useRef(false);
  const interactionRef = useRef<Interaction | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const savedStatusTimerRef = useRef<number | null>(null);

  function clearSavedStatusTimer() {
    if (savedStatusTimerRef.current) {
      window.clearTimeout(savedStatusTimerRef.current);
      savedStatusTimerRef.current = null;
    }
  }

  function showSavedStatus() {
    clearSavedStatusTimer();
    setStatus("✓ All changes saved");
    savedStatusTimerRef.current = window.setTimeout(() => {
      setStatus((currentStatus) => (currentStatus === "✓ All changes saved" ? "" : currentStatus));
      savedStatusTimerRef.current = null;
    }, 3000);
  }

  function markDirty() {
    clearSavedStatusTimer();
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function selectTheme(themeRecord: Theme, options: { preserveRegionSelection?: boolean } = {}) {
    selectedThemeIdRef.current = themeRecord.id;
    setSelectedThemeId(themeRecord.id);
    setTheme(themeRecord);
    const nextRegionId =
      options.preserveRegionSelection && themeRecord.regions.some((region) => region.id === selectedRegionIdRef.current)
        ? selectedRegionIdRef.current
        : themeRecord.regions[0]?.id ?? "main-program";
    selectedRegionIdRef.current = nextRegionId;
    setSelectedRegionId(nextRegionId);
  }

  function openTheme(themeRecord: Theme, options: { discardDirty?: boolean } = {}) {
    if (isDirtyRef.current && !options.discardDirty) {
      setPendingNavigation({ type: "open", theme: themeRecord });
      return;
    }

    selectTheme(themeRecord);
    isDirtyRef.current = false;
    setIsDirty(false);
    setViewMode("editor");
  }

  function backToLibrary(options: { discardDirty?: boolean } = {}) {
    if (isDirtyRef.current && !options.discardDirty) {
      setPendingNavigation({ type: "back" });
      return;
    }

    setViewMode("library");
    isDirtyRef.current = false;
    setIsDirty(false);
  }

  async function loadThemes(options: { force?: boolean; silent?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      return;
    }

    if (!options.silent) {
      setIsBusy(true);
    }

    try {
      const response = await fetch(apiUrl("/api/themes"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Theme[];
      const selectedTheme = body.find((item) => item.id === selectedThemeIdRef.current);
      const fallbackTheme = body.find((item) => item.id === defaultThemeId) ?? body[0];

      setThemes(body);

      if (selectedTheme) {
        selectTheme(selectedTheme, { preserveRegionSelection: true });
        isDirtyRef.current = false;
        setIsDirty(false);
        setStatus(options.silent ? "Themes refreshed." : "Themes loaded.");
      } else if (options.force && fallbackTheme) {
        selectTheme(fallbackTheme);
        isDirtyRef.current = false;
        setIsDirty(false);
        setStatus("Themes loaded.");
      } else if (body.length > 0) {
        setStatus("Themes refreshed, but the active local draft was kept because the selected theme was not returned.");
      } else {
        setStatus("Theme list is empty. Active local draft was kept.");
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Unable to load themes: ${error.message}. Active local draft was kept.`
          : "Unable to load themes. Active local draft was kept."
      );
    } finally {
      if (!options.silent) {
        setIsBusy(false);
      }
    }
  }

  async function loadMedia() {
    try {
      const response = await fetch(apiUrl("/api/media"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as MediaItem[];
      setMediaItems(body.filter(isSupportedThemeImage));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Unable to load media: ${error.message}. Theme draft was kept.`
          : "Unable to load media. Theme draft was kept."
      );
    }
  }

  async function refreshThemeDesigner() {
    await loadThemes({ force: true });
    await loadMedia();
  }

  function updateTheme(updater: (currentTheme: Theme) => Theme) {
    setTheme((currentTheme) => updater(currentTheme));
    markDirty();
  }

  function updateRegionGeometry(region: ThemeRegion) {
    updateTheme((currentTheme) => {
      const hasRegion = currentTheme.regions.some((item) => item.id === region.id);

      return {
        ...currentTheme,
        regions: hasRegion
          ? currentTheme.regions.map((item) => (item.id === region.id ? region : item))
          : [...currentTheme.regions, region]
      };
    });
  }

  function updateSelectedRegion(field: "name" | "x" | "y" | "width" | "height", value: string | number) {
    updateTheme((currentTheme) => {
      const selectedRegion = currentTheme.regions.find((region) => region.id === selectedRegionIdRef.current) ??
        defaultRegion(currentTheme);
      const region = {
        ...selectedRegion,
        [field]: value
      };

      return {
        ...currentTheme,
        regions: currentTheme.regions.some((item) => item.id === region.id)
          ? currentTheme.regions.map((item) => (item.id === region.id ? region : item))
          : [...currentTheme.regions, region]
      };
    });
  }

  function patchSelectedRegion(patch: Partial<ThemeRegion>) {
    updateTheme((currentTheme) => {
      const selectedRegion = currentTheme.regions.find((region) => region.id === selectedRegionIdRef.current) ??
        defaultRegion(currentTheme);
      const region = {
        ...selectedRegion,
        ...patch
      };

      return {
        ...currentTheme,
        regions: currentTheme.regions.some((item) => item.id === region.id)
          ? currentTheme.regions.map((item) => (item.id === region.id ? region : item))
          : [...currentTheme.regions, region]
      };
    });
  }

  function updateOrientation(orientation: "landscape" | "portrait") {
    updateTheme((currentTheme) => {
      const canvasWidth = orientation === "portrait" ? 1080 : 1920;
      const canvasHeight = orientation === "portrait" ? 1920 : 1080;
      const region = {
        ...defaultRegion(currentTheme),
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight
      };

      return {
        ...currentTheme,
        orientation,
        canvasWidth,
        canvasHeight,
        regions: [region, ...currentTheme.regions.filter((item) => item.id !== region.id)]
      };
    });
  }

  function constrainRegion(region: ThemeRegion) {
    const width = clamp(region.width, minimumRegionSize, theme.canvasWidth);
    const height = clamp(region.height, minimumRegionSize, theme.canvasHeight);
    const x = clamp(region.x, 0, theme.canvasWidth - width);
    const y = clamp(region.y, 0, theme.canvasHeight - height);

    return {
      ...region,
      x,
      y,
      width,
      height
    };
  }

  function beginMove(event: PointerEvent<HTMLDivElement>, region: ThemeRegion) {
    selectedRegionIdRef.current = region.id;
    setSelectedRegionId(region.id);

    if (region.locked) {
      return;
    }

    if (!canvasRef.current) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = getPointerPosition(event, canvasRef.current, theme);
    interactionRef.current = {
      mode: "move",
      pointerX: pointer.x,
      pointerY: pointer.y,
      region
    };
    setIsInteracting(true);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle, region: ThemeRegion) {
    selectedRegionIdRef.current = region.id;
    setSelectedRegionId(region.id);

    if (region.locked) {
      return;
    }

    if (!canvasRef.current) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = getPointerPosition(event, canvasRef.current, theme);
    interactionRef.current = {
      mode: "resize",
      handle,
      pointerX: pointer.x,
      pointerY: pointer.y,
      region
    };
    setIsInteracting(true);
  }

  function updateInteraction(event: PointerEvent<HTMLElement>) {
    if (!interactionRef.current || !canvasRef.current) {
      return;
    }

    const pointer = getPointerPosition(event, canvasRef.current, theme);
    const interaction = interactionRef.current;
    const deltaX = pointer.x - interaction.pointerX;
    const deltaY = pointer.y - interaction.pointerY;
    let nextRegion = { ...interaction.region };

    if (interaction.mode === "move") {
      nextRegion.x = snapValue(interaction.region.x + deltaX, snapToGrid, gridSize);
      nextRegion.y = snapValue(interaction.region.y + deltaY, snapToGrid, gridSize);
    } else {
      const left = interaction.region.x;
      const top = interaction.region.y;
      const right = interaction.region.x + interaction.region.width;
      const bottom = interaction.region.y + interaction.region.height;
      let nextLeft = left;
      let nextTop = top;
      let nextRight = right;
      let nextBottom = bottom;

      if (interaction.handle.includes("w")) {
        nextLeft = snapValue(left + deltaX, snapToGrid, gridSize);
      }

      if (interaction.handle.includes("e")) {
        nextRight = snapValue(right + deltaX, snapToGrid, gridSize);
      }

      if (interaction.handle.includes("n")) {
        nextTop = snapValue(top + deltaY, snapToGrid, gridSize);
      }

      if (interaction.handle.includes("s")) {
        nextBottom = snapValue(bottom + deltaY, snapToGrid, gridSize);
      }

      if (nextRight - nextLeft < minimumRegionSize) {
        if (interaction.handle.includes("w")) {
          nextLeft = nextRight - minimumRegionSize;
        } else {
          nextRight = nextLeft + minimumRegionSize;
        }
      }

      if (nextBottom - nextTop < minimumRegionSize) {
        if (interaction.handle.includes("n")) {
          nextTop = nextBottom - minimumRegionSize;
        } else {
          nextBottom = nextTop + minimumRegionSize;
        }
      }

      nextRegion = {
        ...nextRegion,
        x: nextLeft,
        y: nextTop,
        width: nextRight - nextLeft,
        height: nextBottom - nextTop
      };
    }

    updateRegionGeometry(constrainRegion(nextRegion));
  }

  function endInteraction() {
    interactionRef.current = null;
    setIsInteracting(false);
  }

  function addRegion(type: ThemeRegionType) {
    const region = createRegion(type, theme, gridSize, snapToGrid);

    updateRegionGeometry(constrainRegion(region));
    selectedRegionIdRef.current = region.id;
    setSelectedRegionId(region.id);
  }

  function duplicateSelectedRegion() {
    const selectedRegion = theme.regions.find((region) => region.id === selectedRegionIdRef.current);

    if (!selectedRegion) {
      return;
    }

    const region: ThemeRegion = constrainRegion({
      ...selectedRegion,
      id: `${selectedRegion.id}-${Date.now()}`,
      name: `${selectedRegion.name} Copy`,
      x: selectedRegion.x + gridSize,
      y: selectedRegion.y + gridSize
    });

    updateRegionGeometry(region);
    selectedRegionIdRef.current = region.id;
    setSelectedRegionId(region.id);
  }

  function moveSelectedRegion(direction: "up" | "down") {
    const selectedRegionIndex = theme.regions.findIndex((region) => region.id === selectedRegionIdRef.current);

    if (selectedRegionIndex < 0) {
      return;
    }

    const nextIndex = direction === "up" ? selectedRegionIndex - 1 : selectedRegionIndex + 1;

    if (nextIndex < 0 || nextIndex >= theme.regions.length) {
      return;
    }

    updateTheme((currentTheme) => {
      const regions = [...currentTheme.regions];
      const [region] = regions.splice(selectedRegionIndex, 1);
      regions.splice(nextIndex, 0, region);

      return {
        ...currentTheme,
        regions
      };
    });
  }

  function deleteSelectedRegion() {
    const selectedRegion = theme.regions.find((region) => region.id === selectedRegionIdRef.current);

    if (!selectedRegion) {
      return;
    }

    if (selectedRegion.type === "program" && theme.regions.filter((region) => region.type === "program").length <= 1) {
      setStatus("At least one Main Content region is required.");
      return;
    }

    const nextRegions = theme.regions.filter((region) => region.id !== selectedRegion.id);
    const nextSelectedRegion = nextRegions[0];
    selectedRegionIdRef.current = nextSelectedRegion?.id ?? "main-program";
    setSelectedRegionId(selectedRegionIdRef.current);
    updateTheme((currentTheme) => ({
      ...currentTheme,
      regions: nextRegions
    }));
  }

  function alignSelectedRegion(action: "left" | "right" | "top" | "bottom" | "center-x" | "center-y" | "match") {
    const selectedRegion = theme.regions.find((region) => region.id === selectedRegionIdRef.current);

    if (!selectedRegion) {
      return;
    }

    const nextRegion = { ...selectedRegion };

    if (action === "left" || action === "match") {
      nextRegion.x = 0;
    }

    if (action === "right") {
      nextRegion.x = theme.canvasWidth - nextRegion.width;
    }

    if (action === "top" || action === "match") {
      nextRegion.y = 0;
    }

    if (action === "bottom") {
      nextRegion.y = theme.canvasHeight - nextRegion.height;
    }

    if (action === "center-x") {
      nextRegion.x = (theme.canvasWidth - nextRegion.width) / 2;
    }

    if (action === "center-y") {
      nextRegion.y = (theme.canvasHeight - nextRegion.height) / 2;
    }

    if (action === "match") {
      nextRegion.width = theme.canvasWidth;
      nextRegion.height = theme.canvasHeight;
    }

    updateRegionGeometry(constrainRegion(nextRegion));
  }

  async function createTheme() {
    setIsBusy(true);
    setStatus("Creating theme...");

    try {
      const response = await fetch(apiUrl("/api/themes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Theme" })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Theme;
      selectTheme(body);
      isDirtyRef.current = false;
      setIsDirty(false);
      setThemes((currentThemes) => {
        const hasTheme = currentThemes.some((item) => item.id === body.id);
        return hasTheme ? currentThemes.map((item) => (item.id === body.id ? body : item)) : [...currentThemes, body];
      });
      setViewMode("editor");
      setStatus(`${body.name} created.`);
      return body;
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function saveTheme(themeToSave = theme) {
    setIsBusy(true);
    setStatus(`Saving ${themeToSave.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/themes/${encodeURIComponent(themeToSave.id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(themeToSave)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Theme;
      selectTheme(body, { preserveRegionSelection: true });
      isDirtyRef.current = false;
      setIsDirty(false);
      setThemes((currentThemes) => {
        const hasTheme = currentThemes.some((item) => item.id === body.id);
        return hasTheme ? currentThemes.map((item) => (item.id === body.id ? body : item)) : [...currentThemes, body];
      });
      showSavedStatus();
      return body;
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function duplicateTheme(source: Theme) {
    const createdTheme = await createTheme();

    if (!createdTheme) {
      return;
    }

    await saveTheme({
      ...source,
      id: createdTheme.id,
      name: `${source.name} Copy`,
      regions: source.regions.map((region) => ({ ...region }))
    });
  }

  async function renameTheme() {
    if (!renameTarget) {
      return;
    }

    const name = renameValue.trim();

    if (!name) {
      setStatus("Theme name cannot be empty.");
      return;
    }

    setRenameTarget(null);
    await saveTheme({ ...renameTarget, name });
  }

  async function deleteTheme(themeToDelete = theme) {
    if (themeToDelete.id === defaultThemeId) {
      setStatus("Default Fullscreen theme cannot be deleted.");
      setDeleteTarget(null);
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${themeToDelete.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/themes/${encodeURIComponent(themeToDelete.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      selectedThemeIdRef.current = defaultThemeId;
      setSelectedThemeId(defaultThemeId);
      setDeleteTarget(null);
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadThemes({ force: true });
      setViewMode("library");
      setStatus(`${themeToDelete.name} deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function resolvePendingNavigation(action: "cancel" | "discard" | "save") {
    const pending = pendingNavigation;

    if (!pending) {
      return;
    }

    if (action === "cancel") {
      setPendingNavigation(null);
      return;
    }

    if (action === "save") {
      const saved = await saveTheme();

      if (!saved) {
        return;
      }
    } else {
      isDirtyRef.current = false;
      setIsDirty(false);
    }

    setPendingNavigation(null);

    if (pending.type === "back") {
      backToLibrary({ discardDirty: true });
    } else {
      openTheme(pending.theme, { discardDirty: true });
    }
  }

  useEffect(() => {
    void loadThemes();
    void loadMedia();
    const timer = window.setInterval(() => void loadThemes({ silent: true }), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => clearSavedStatusTimer(), []);

  const mainRegion = defaultRegion(theme);
  const selectedRegion =
    theme.regions.find((region) => region.id === selectedRegionId) ??
    theme.regions[0] ??
    mainRegion;
  const programRegionCount = theme.regions.filter((region) => region.type === "program").length;
  const selectedRegionMedia = getRegionMedia(selectedRegion);
  const selectedRegionNeedsImage = selectedRegion.type === "logo" || selectedRegion.type === "image";
  const selectedRegionMediaMissing = selectedRegionNeedsImage && Boolean(selectedRegion.file) && !selectedRegionMedia;
  const canvasStyle = {
    aspectRatio: `${theme.canvasWidth} / ${theme.canvasHeight}`,
    backgroundColor: theme.backgroundColor,
    backgroundImage: showGrid
      ? `linear-gradient(to right, rgb(255 255 255 / 16%) 1px, transparent 1px),
        linear-gradient(to bottom, rgb(255 255 255 / 16%) 1px, transparent 1px)`
      : undefined,
    backgroundSize: showGrid
      ? `${(gridSize / theme.canvasWidth) * 100}% ${(gridSize / theme.canvasHeight) * 100}%`
      : undefined
  };
  function getRegionStyle(region: ThemeRegion, index: number) {
    const colors = regionColors[region.type] ?? regionColors.program;

    return {
      left: `${(region.x / theme.canvasWidth) * 100}%`,
      top: `${(region.y / theme.canvasHeight) * 100}%`,
      width: `${(region.width / theme.canvasWidth) * 100}%`,
      height: `${(region.height / theme.canvasHeight) * 100}%`,
      borderColor: colors.color,
      backgroundColor: colors.background,
      opacity: region.visible === false ? 0.36 : region.opacity ?? 1,
      zIndex: theme.regions.length - index
    };
  }

  function getRegionMedia(region: ThemeRegion) {
    return mediaItems.find(
      (item) => item.mediaId === region.mediaId || item.id === region.mediaId || item.filename === region.file
    );
  }

  function renderDesignerRegionPreview(region: ThemeRegion) {
    if (region.type === "clock") {
      return (
        <span
          className="theme-region-clock-preview"
          style={{
            backgroundColor: region.backgroundColor ?? "transparent",
            color: region.textColor ?? "#ffffff",
            fontFamily: region.font ?? "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: `${Math.max((region.fontSize ?? 64) * 0.18, 12)}px`,
            fontStyle: region.italic ? "italic" : "normal",
            fontWeight: region.bold ? 700 : 400,
            justifyContent:
              region.align === "right" ? "flex-end" : region.align === "left" ? "flex-start" : "center",
            padding: `${Math.max((region.padding ?? 0) * 0.12, 4)}px`,
            textAlign: region.align ?? "center"
          }}
        >
          {formatClock(clockNow, region.clockFormat)}
        </span>
      );
    }

    if ((region.type !== "logo" && region.type !== "image") || !region.file) {
      return null;
    }

    return (
      <img
        alt=""
        className="theme-region-preview"
        src={apiUrl(`/media/${encodeURIComponent(region.file)}`)}
        style={{
          objectFit:
            region.objectFit === "stretch"
              ? "fill"
              : region.objectFit === "center"
                ? "none"
                : region.objectFit ?? "contain"
        }}
      />
    );
  }

  function getPreviewRegionStyle(region: ThemeRegion, index: number) {
    const regionStyle = getRegionStyle(region, index);

    return {
      ...regionStyle,
      borderColor: "transparent",
      borderWidth: 0,
      cursor: "default",
      opacity: region.opacity ?? 1,
      pointerEvents: "none" as const
    };
  }

  function renderThemePresentationPreview() {
    const previewWidth = theme.orientation === "portrait" ? "min(100%, 48vh)" : "min(100%, 1180px)";

    return (
      <div className="theme-preview-stage">
        <div
          className={isTransparentColor(theme.backgroundColor) ? "theme-preview-canvas transparent-background" : "theme-preview-canvas"}
          style={{
            aspectRatio: `${theme.canvasWidth} / ${theme.canvasHeight}`,
            backgroundColor: isTransparentColor(theme.backgroundColor) ? undefined : theme.backgroundColor,
            width: previewWidth
          }}
        >
          {theme.regions
            .filter((region) => region.visible !== false)
            .map((region, index) => (
              <div className="theme-preview-region" key={region.id} style={getPreviewRegionStyle(region, index)}>
                {renderDesignerRegionPreview(region)}
                {region.type === "logo" || region.type === "image" || region.type === "clock" ? null : (
                  <span className="theme-preview-region-label">{region.name}</span>
                )}
              </div>
            ))}
        </div>
      </div>
    );
  }

  function renderThemePreview(themeRecord: Theme) {
    return (
      <div
        className={isTransparentColor(themeRecord.backgroundColor) ? "theme-library-preview transparent-background" : "theme-library-preview"}
        style={{
          aspectRatio: `${themeRecord.canvasWidth} / ${themeRecord.canvasHeight}`,
          backgroundColor: isTransparentColor(themeRecord.backgroundColor) ? undefined : themeRecord.backgroundColor
        }}
      >
        {themeRecord.regions.map((region, index) => (
          <span
            className="theme-library-region"
            key={region.id}
            style={{
              zIndex: index + 1,
              left: `${(region.x / themeRecord.canvasWidth) * 100}%`,
              top: `${(region.y / themeRecord.canvasHeight) * 100}%`,
              width: `${(region.width / themeRecord.canvasWidth) * 100}%`,
              height: `${(region.height / themeRecord.canvasHeight) * 100}%`,
              borderColor: regionColors[region.type]?.color ?? regionColors.program.color,
              background: regionColors[region.type]?.background ?? regionColors.program.background
            }}
          />
        ))}
      </div>
    );
  }

  function renderThemeCard(themeRecord: Theme) {
    return (
      <article className="theme-library-card" key={themeRecord.id}>
        <button className="theme-library-open" onClick={() => openTheme(themeRecord)} type="button">
          {renderThemePreview(themeRecord)}
          <div className="playlist-library-main">
            <strong>{themeRecord.name}</strong>
            <span>{themeRecord.orientation} - {themeRecord.canvasWidth} x {themeRecord.canvasHeight}</span>
            <span>{themeRecord.regions.length} region(s)</span>
            <span>Last modified: {formatUpdatedAt((themeRecord as Theme & { updatedAt?: string }).updatedAt)}</span>
          </div>
        </button>
        <details className="playlist-card-menu">
          <summary aria-label={`Actions for ${themeRecord.name}`}>...</summary>
          <div>
            <button onClick={() => openTheme(themeRecord)} type="button">Open</button>
            <button disabled={isBusy} onClick={() => void duplicateTheme(themeRecord)} type="button">Duplicate</button>
            <button
              disabled={isBusy}
              onClick={() => {
                setRenameTarget(themeRecord);
                setRenameValue(themeRecord.name);
              }}
              type="button"
            >
              Rename
            </button>
            <button disabled={isBusy || themeRecord.id === defaultThemeId} onClick={() => setDeleteTarget(themeRecord)} type="button">Delete</button>
          </div>
        </details>
      </article>
    );
  }

  return (
    <section className="page-section" id="themes">
      {viewMode === "library" ? (
        <>
          <div className="section-header">
            <div>
              <h2>Themes</h2>
              <p>Manage presentation layouts for resolved playback content.</p>
            </div>
            <div className="button-row">
              <button disabled={isBusy} onClick={() => void refreshThemeDesigner()} type="button">Refresh</button>
              <button className="primary-button" disabled={isBusy} onClick={() => void createTheme()} type="button">+ New Theme</button>
            </div>
          </div>

          <p className="status-text">{status}</p>

          <div className="theme-library-grid">
            {themes.length > 0 ? themes.map(renderThemeCard) : <p className="operator-empty">No themes found. Create a theme to start designing layouts.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="playlist-editor-header theme-editor-header">
            <button onClick={() => backToLibrary()} type="button">← Back to Themes</button>
            <div className="playlist-editor-title-row">
              <input
                aria-label="Theme name"
                className="operator-title-input"
                onChange={(event) => updateTheme((currentTheme) => ({ ...currentTheme, name: event.target.value }))}
                value={theme.name}
              />
              <span>{theme.orientation} - {theme.canvasWidth} x {theme.canvasHeight}</span>
            </div>
            <div className="button-row">
              <button onClick={() => setIsPreviewOpen(true)} type="button">Preview</button>
              <details className="playlist-card-menu playlist-editor-menu">
                <summary aria-label={`Actions for ${theme.name}`}>...</summary>
                <div>
                  <button
                    disabled={isBusy}
                    onClick={() => {
                      setRenameTarget(theme);
                      setRenameValue(theme.name);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button disabled={isBusy} onClick={() => void duplicateTheme(theme)} type="button">Duplicate</button>
                  <button disabled={isBusy || theme.id === defaultThemeId} onClick={() => setDeleteTarget(theme)} type="button">Delete</button>
                </div>
              </details>
              <button className="primary-button" disabled={isBusy || !isDirty} onClick={() => void saveTheme()} type="button">Save Changes</button>
            </div>
          </div>

          <p className="status-text">{status}{isDirty ? " Unsaved changes." : ""}</p>

          <div className="theme-designer-layout theme-editor-layout">
            <aside className="theme-list-panel theme-layers-only-panel" aria-label="Theme layers">
              <div className="theme-layers-panel">
                <h3>Layers</h3>
                <button className="theme-layer-item static" disabled type="button">Theme</button>
                <button className="theme-layer-item static" disabled type="button">Background</button>
                {theme.regions.map((region) => (
                  <button
                    className={[
                      region.id === selectedRegion.id ? "theme-layer-item selected" : "theme-layer-item",
                      region.visible === false ? "hidden" : "",
                      region.locked ? "locked" : ""
                    ].join(" ")}
                    key={region.id}
                    onClick={() => {
                      selectedRegionIdRef.current = region.id;
                      setSelectedRegionId(region.id);
                    }}
                    type="button"
                  >
                    <span className="theme-layer-color" style={{ backgroundColor: regionColors[region.type]?.color ?? regionColors.program.color }} />
                    <span className="theme-layer-main">
                      <strong>{region.name}</strong>
                      <span>{getRegionTypeLabel(region.type)}</span>
                    </span>
                  </button>
                ))}
                <div className="theme-layer-actions">
                  <button disabled={theme.regions.findIndex((region) => region.id === selectedRegion.id) <= 0} onClick={() => moveSelectedRegion("up")} type="button">Up</button>
                  <button disabled={theme.regions.findIndex((region) => region.id === selectedRegion.id) >= theme.regions.length - 1} onClick={() => moveSelectedRegion("down")} type="button">Down</button>
                </div>
              </div>

              <label className="add-region-control">
                Add Region
                <select
                  onChange={(event) => {
                    const type = event.target.value as ThemeRegionType;
                    if (addableRegionTypes.some((item) => item.type === type)) {
                      addRegion(type);
                    }
                    event.target.value = "";
                  }}
                  value=""
                >
                  <option value="">Choose type</option>
                  {addableRegionTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                </select>
              </label>
            </aside>

            <article className="theme-designer-panel theme-editor-panel">
              <div className="theme-toolbar compact-theme-toolbar">
                <ColorControl allowTransparent fallback="#000000" label="Background" onChange={(value) => updateTheme((currentTheme) => ({ ...currentTheme, backgroundColor: value }))} value={theme.backgroundColor} />
                <label>Show Grid<input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" /></label>
                <label>Snap To Grid<input checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} type="checkbox" /></label>
                <label>Grid Size<select onChange={(event) => setGridSize(Number(event.target.value))} value={gridSize}><option value="10">10</option><option value="20">20</option><option value="40">40</option></select></label>
                <label>Safe Area<input checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)} type="checkbox" /></label>
              </div>

              <div className="theme-canvas-frame">
                <div
                  className={isTransparentColor(theme.backgroundColor) ? "theme-design-canvas transparent-background" : "theme-design-canvas"}
                  onPointerMove={updateInteraction}
                  onPointerUp={endInteraction}
                  onPointerLeave={endInteraction}
                  ref={canvasRef}
                  style={canvasStyle}
                >
                  {showSafeArea ? <div className="theme-safe-area" style={{ inset: `${(defaultSafeArea / theme.canvasHeight) * 100}% ${(defaultSafeArea / theme.canvasWidth) * 100}%` }} /> : null}
                  <div className="theme-center-guide vertical" />
                  <div className="theme-center-guide horizontal" />
                  {theme.regions.map((region, index) => {
                    const isSelected = region.id === selectedRegion.id;
                    return (
                      <div className={isSelected ? "theme-region selected" : "theme-region"} key={region.id} onPointerDown={(event) => beginMove(event, region)} role="button" style={getRegionStyle(region, index)} tabIndex={0}>
                        {renderDesignerRegionPreview(region)}
                        <span className="theme-region-name">{region.name}</span>
                        {isSelected && isInteracting ? <span className="theme-region-label">x {region.x} y {region.y} | {region.width} x {region.height}</span> : null}
                        {isSelected ? resizeHandles.map((handle) => <button aria-label={`Resize ${handle}`} className={`theme-resize-handle ${handle}`} key={handle} onPointerDown={(event) => beginResize(event, handle, region)} type="button" />) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="theme-property-panel" aria-label="Region properties">
                <h3>Properties</h3>
                <details open>
                  <summary>General</summary>
                  <label>Region Name<input onChange={(event) => updateSelectedRegion("name", event.target.value)} type="text" value={selectedRegion.name} /></label>
                  <label>Region Type<input readOnly type="text" value={getRegionTypeLabel(selectedRegion.type)} /></label>
                  <div className="theme-property-toggles">
                    <label>Visible<input checked={selectedRegion.visible !== false} onChange={(event) => patchSelectedRegion({ visible: event.target.checked })} type="checkbox" /></label>
                    <label>Locked<input checked={selectedRegion.locked === true} onChange={(event) => patchSelectedRegion({ locked: event.target.checked })} type="checkbox" /></label>
                  </div>
                  <div className="theme-property-actions">
                    <button onClick={duplicateSelectedRegion} type="button">Duplicate</button>
                    <button disabled={selectedRegion.type === "program" && programRegionCount <= 1} onClick={deleteSelectedRegion} type="button">Delete</button>
                  </div>
                </details>

                <details>
                  <summary>Position & Size</summary>
                  <div className="theme-form-grid">
                    <label>X<input type="number" value={selectedRegion.x} onChange={(event) => updateSelectedRegion("x", Number(event.target.value))} /></label>
                    <label>Y<input type="number" value={selectedRegion.y} onChange={(event) => updateSelectedRegion("y", Number(event.target.value))} /></label>
                    <label>Width<input min="1" type="number" value={selectedRegion.width} onChange={(event) => updateSelectedRegion("width", Number(event.target.value))} /></label>
                    <label>Height<input min="1" type="number" value={selectedRegion.height} onChange={(event) => updateSelectedRegion("height", Number(event.target.value))} /></label>
                  </div>
                  <div className="theme-align-tools">
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("left")} type="button">Align Left</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("right")} type="button">Align Right</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("top")} type="button">Align Top</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("bottom")} type="button">Align Bottom</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("center-x")} type="button">Center H</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("center-y")} type="button">Center V</button>
                    <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("match")} type="button">Match Canvas</button>
                  </div>
                </details>

                <details>
                  <summary>Appearance</summary>
                  {(selectedRegion.type === "logo" || selectedRegion.type === "image") ? (
                    <div className="theme-dynamic-properties">
                      <label>Image<select onChange={(event) => { const media = mediaItems.find((item) => item.mediaId === event.target.value || item.id === event.target.value); patchSelectedRegion({ mediaId: media?.mediaId, file: media?.filename }); }} value={selectedRegionMedia?.mediaId ?? ""}><option value="">Select image</option>{mediaItems.map((item) => <option key={item.mediaId} value={item.mediaId}>{item.filename}</option>)}</select></label>
                      <div className="theme-selected-media">
                        <span>Selected file</span>
                        <strong>{selectedRegion.file ?? selectedRegionMedia?.filename ?? "No image selected"}</strong>
                        {selectedRegion.file ? <img alt="" className="theme-selected-media-preview" src={apiUrl(`/media/${encodeURIComponent(selectedRegion.file)}`)} /> : null}
                        <button disabled={!selectedRegion.file && !selectedRegion.mediaId} onClick={() => patchSelectedRegion({ mediaId: undefined, file: undefined })} type="button">Clear image</button>
                        <button onClick={() => void loadMedia()} type="button">Refresh media</button>
                      </div>
                      {selectedRegionMediaMissing ? <p className="theme-warning-text">Selected image is not in the Media Library: {selectedRegion.file}</p> : null}
                    </div>
                  ) : null}
                  {selectedRegion.type === "text" ? (
                    <div className="theme-dynamic-properties">
                      <label>Text<textarea onChange={(event) => patchSelectedRegion({ text: event.target.value })} rows={4} value={selectedRegion.text ?? ""} /></label>
                      <label>Font<input onChange={(event) => patchSelectedRegion({ font: event.target.value })} type="text" value={selectedRegion.font ?? "Inter"} /></label>
                      <label>Font Size<input min="1" onChange={(event) => patchSelectedRegion({ fontSize: Number(event.target.value) })} type="number" value={selectedRegion.fontSize ?? 64} /></label>
                      <div className="theme-property-toggles"><label>Bold<input checked={selectedRegion.bold === true} onChange={(event) => patchSelectedRegion({ bold: event.target.checked })} type="checkbox" /></label><label>Italic<input checked={selectedRegion.italic === true} onChange={(event) => patchSelectedRegion({ italic: event.target.checked })} type="checkbox" /></label></div>
                      <label>Alignment<select onChange={(event) => patchSelectedRegion({ align: event.target.value as ThemeTextAlign })} value={selectedRegion.align ?? "center"}>{textAlignOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                      <ColorControl fallback="#ffffff" label="Text Color" onChange={(value) => patchSelectedRegion({ textColor: value })} value={selectedRegion.textColor ?? "#ffffff"} />
                      <ColorControl allowTransparent fallback="#000000" label="Background Color" onChange={(value) => patchSelectedRegion({ backgroundColor: value })} value={selectedRegion.backgroundColor ?? "#000000"} />
                    </div>
                  ) : null}
                  {selectedRegion.type === "clock" ? (
                    <div className="theme-dynamic-properties">
                      <label>Format<select onChange={(event) => patchSelectedRegion({ clockFormat: event.target.value as ThemeClockFormat })} value={selectedRegion.clockFormat ?? "HH:mm"}>{clockFormatOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                      <label>Font<input onChange={(event) => patchSelectedRegion({ font: event.target.value })} type="text" value={selectedRegion.font ?? "Inter"} /></label>
                      <label>Font Size<input min="1" onChange={(event) => patchSelectedRegion({ fontSize: Number(event.target.value) })} type="number" value={selectedRegion.fontSize ?? 64} /></label>
                      <div className="theme-property-toggles"><label>Bold<input checked={selectedRegion.bold === true} onChange={(event) => patchSelectedRegion({ bold: event.target.checked })} type="checkbox" /></label><label>Italic<input checked={selectedRegion.italic === true} onChange={(event) => patchSelectedRegion({ italic: event.target.checked })} type="checkbox" /></label></div>
                      <label>Alignment<select onChange={(event) => patchSelectedRegion({ align: event.target.value as ThemeTextAlign })} value={selectedRegion.align ?? "center"}>{textAlignOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                      <ColorControl fallback="#ffffff" label="Text Color" onChange={(value) => patchSelectedRegion({ textColor: value })} value={selectedRegion.textColor ?? "#ffffff"} />
                      <ColorControl allowTransparent fallback="#000000" label="Background Color" onChange={(value) => patchSelectedRegion({ backgroundColor: value })} value={selectedRegion.backgroundColor ?? "#000000"} />
                    </div>
                  ) : null}
                  {selectedRegion.type === "program" || selectedRegion.type === "rss" ? <p className="theme-warning-text">This region uses resolved playback content. Position and size are controlled here.</p> : null}
                </details>

                <details className="theme-advanced-panel" open={isAdvancedOpen} onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}>
                  <summary>Advanced</summary>
                  <div className="theme-form-grid">
                    <label>Orientation<select onChange={(event) => updateOrientation(event.target.value === "portrait" ? "portrait" : "landscape")} value={theme.orientation}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
                    <label>Canvas width<input min="1" onChange={(event) => updateTheme((currentTheme) => ({ ...currentTheme, canvasWidth: Number(event.target.value) }))} type="number" value={theme.canvasWidth} /></label>
                    <label>Canvas height<input min="1" onChange={(event) => updateTheme((currentTheme) => ({ ...currentTheme, canvasHeight: Number(event.target.value) }))} type="number" value={theme.canvasHeight} /></label>
                  </div>
                </details>
              </aside>
            </article>
          </div>
        </>
      )}

      {isPreviewOpen ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal theme-preview-modal" role="dialog">
            <div className="theme-preview-modal-header">
              <h3>Theme Preview</h3>
            </div>
            {renderThemePresentationPreview()}
            <div className="media-trash-modal-actions">
              <button onClick={() => setIsPreviewOpen(false)} type="button">
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingNavigation ? (
        <div className="media-trash-modal-backdrop" role="presentation"><section aria-modal="true" className="media-trash-modal" role="dialog"><h3>Unsaved changes</h3><p>This theme has changes that have not been saved.</p><div className="media-trash-modal-actions"><button onClick={() => void resolvePendingNavigation("cancel")} type="button">Cancel</button><button className="danger-button" onClick={() => void resolvePendingNavigation("discard")} type="button">Discard Changes</button><button className="primary-button" disabled={isBusy} onClick={() => void resolvePendingNavigation("save")} type="button">Save and Continue</button></div></section></div>
      ) : null}

      {renameTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation"><section aria-modal="true" className="media-trash-modal" role="dialog"><h3>Rename theme</h3><input aria-label="Theme name" onChange={(event) => setRenameValue(event.target.value)} type="text" value={renameValue} /><div className="media-trash-modal-actions"><button onClick={() => setRenameTarget(null)} type="button">Cancel</button><button className="primary-button" disabled={isBusy || !renameValue.trim()} onClick={() => void renameTheme()} type="button">Rename</button></div></section></div>
      ) : null}

      {deleteTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation"><section aria-modal="true" className="media-trash-modal" role="dialog"><h3>Delete theme</h3><p>Delete "{deleteTarget.name}"? This does not delete programs or schedules.</p><div className="media-trash-modal-actions"><button onClick={() => setDeleteTarget(null)} type="button">Cancel</button><button className="danger-button" disabled={isBusy || deleteTarget.id === defaultThemeId} onClick={() => void deleteTheme(deleteTarget)} type="button">Delete Theme</button></div></section></div>
      ) : null}
    </section>
  );
}
