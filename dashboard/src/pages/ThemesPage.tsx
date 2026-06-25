import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { apiUrl } from "../api/apiBase";
import type { MediaItem } from "../mediaTypes";
import type { Theme, ThemeObjectFit, ThemeRegion, ThemeRegionType, ThemeTextAlign } from "../themeTypes";

const refreshIntervalMs = 10_000;
const defaultThemeId = "default-fullscreen";
const minimumRegionSize = 40;
const defaultSafeArea = 80;
const resizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const addableRegionTypes: Array<{ label: string; type: ThemeRegionType }> = [
  { label: "Program", type: "program" },
  { label: "Logo", type: "logo" },
  { label: "Image", type: "image" },
  { label: "Text", type: "text" }
];
const futureRegionTypes = ["Clock", "Ticker", "Weather", "RSS", "QR Code", "Video"];
const regionColors: Record<string, { color: string; background: string }> = {
  program: { color: "#30b56a", background: "rgb(48 181 106 / 28%)" },
  logo: { color: "#4777d9", background: "rgb(71 119 217 / 26%)" },
  clock: { color: "#8a5cf6", background: "rgb(138 92 246 / 26%)" },
  ticker: { color: "#d6b21f", background: "rgb(214 178 31 / 28%)" },
  weather: { color: "#19aebd", background: "rgb(25 174 189 / 26%)" },
  rss: { color: "#ef8a24", background: "rgb(239 138 36 / 26%)" },
  emergency: { color: "#d94343", background: "rgb(217 67 67 / 28%)" }
};
const objectFitOptions: ThemeObjectFit[] = ["contain", "cover", "stretch", "center"];
const textAlignOptions: ThemeTextAlign[] = ["left", "center", "right"];
const supportedThemeImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

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
  const label = type === "program" ? "Program Region" : type === "logo" ? "Logo" : type === "image" ? "Image" : "Text";
  return count === 0 ? label : `${label} ${count + 1}`;
}

function createRegion(type: ThemeRegionType, theme: Theme, gridSize: number, snapToGrid: boolean): ThemeRegion {
  const count = theme.regions.filter((region) => region.type === type).length;
  const baseSize = type === "logo" ? 240 : type === "text" ? 520 : 960;
  const baseHeight = type === "logo" ? 160 : type === "text" ? 180 : 540;

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
    font: type === "text" ? "Inter" : undefined,
    fontSize: type === "text" ? 64 : undefined,
    align: type === "text" ? "center" : undefined,
    textColor: type === "text" ? "#ffffff" : undefined,
    backgroundColor: type === "text" ? "#000000" : undefined,
    padding: type === "text" ? 24 : undefined,
    cornerRadius: type === "text" ? 8 : 0
  };
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

export function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
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
  const [selectedRegionId, setSelectedRegionId] = useState("main-program");
  const [isInteracting, setIsInteracting] = useState(false);
  const selectedThemeIdRef = useRef(defaultThemeId);
  const selectedRegionIdRef = useRef("main-program");
  const isDirtyRef = useRef(false);
  const interactionRef = useRef<Interaction | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function markDirty() {
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
      setStatus("At least one Program Region is required.");
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
      setStatus(`${body.name} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveTheme() {
    setIsBusy(true);
    setStatus(`Saving ${theme.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/themes/${encodeURIComponent(theme.id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme)
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
      setStatus(`${body.name} saved.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteTheme() {
    if (theme.id === defaultThemeId) {
      setStatus("Default Fullscreen theme cannot be deleted.");
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${theme.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/themes/${encodeURIComponent(theme.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      selectedThemeIdRef.current = defaultThemeId;
      setSelectedThemeId(defaultThemeId);
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadThemes({ force: true });
      setStatus(`${theme.name} deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadThemes();
    void loadMedia();
    const timer = window.setInterval(() => void loadThemes({ silent: true }), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  const mainRegion = defaultRegion(theme);
  const selectedRegion =
    theme.regions.find((region) => region.id === selectedRegionId) ??
    theme.regions[0] ??
    mainRegion;
  const programRegionCount = theme.regions.filter((region) => region.type === "program").length;
  const selectedRegionMedia = mediaItems.find(
    (item) => item.id === selectedRegion.mediaId || item.filename === selectedRegion.file
  );
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
  function getRegionStyle(region: ThemeRegion) {
    const colors = regionColors[region.type] ?? regionColors.program;

    return {
      left: `${(region.x / theme.canvasWidth) * 100}%`,
      top: `${(region.y / theme.canvasHeight) * 100}%`,
      width: `${(region.width / theme.canvasWidth) * 100}%`,
      height: `${(region.height / theme.canvasHeight) * 100}%`,
      borderColor: colors.color,
      backgroundColor: colors.background,
      opacity: region.visible === false ? 0.36 : region.opacity ?? 1
    };
  }

  return (
    <section className="page-section" id="themes">
      <div className="section-header">
        <div>
          <h2>Themes</h2>
          <p>Virtual canvas layout frames for program playback.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void createTheme()} type="button">
            Create Theme
          </button>
          <button disabled={isBusy} onClick={() => void refreshThemeDesigner()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="theme-designer-layout">
        <aside className="theme-list-panel" aria-label="Theme list">
          <h3>Theme List</h3>
          <div className="theme-list">
            {themes.map((item) => (
              <button
                className={item.id === selectedThemeId ? "theme-list-item selected" : "theme-list-item"}
                disabled={isBusy}
                key={item.id}
                onClick={() => {
                  selectTheme(item);
                  isDirtyRef.current = false;
                  setIsDirty(false);
                }}
                type="button"
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="theme-layers-panel">
            <h3>Layers</h3>
            <button className="theme-layer-item static" disabled type="button">
              Theme
            </button>
            <button className="theme-layer-item static" disabled type="button">
              Background
            </button>
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
                <span
                  className="theme-layer-color"
                  style={{ backgroundColor: regionColors[region.type]?.color ?? regionColors.program.color }}
                />
                <span className="theme-layer-main">
                  <strong>{region.name}</strong>
                  <span>{region.type}</span>
                </span>
              </button>
            ))}
            <div className="theme-layer-actions">
              <button disabled={theme.regions.findIndex((region) => region.id === selectedRegion.id) <= 0} onClick={() => moveSelectedRegion("up")} type="button">
                Up
              </button>
              <button disabled={theme.regions.findIndex((region) => region.id === selectedRegion.id) >= theme.regions.length - 1} onClick={() => moveSelectedRegion("down")} type="button">
                Down
              </button>
            </div>
          </div>

          <label className="add-region-control">
            + Add Region
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
              {addableRegionTypes.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
              {futureRegionTypes.map((type) => (
                <option disabled key={type} value={type.toLowerCase()}>
                  {type} - Coming in future version
                </option>
              ))}
            </select>
          </label>
        </aside>

        <article className="theme-designer-panel">
          <div className="theme-toolbar">
            <label>
              Theme name
              <input
                onChange={(event) => updateTheme((currentTheme) => ({ ...currentTheme, name: event.target.value }))}
                type="text"
                value={theme.name}
              />
            </label>
            <label>
              Background
              <input
                onChange={(event) =>
                  updateTheme((currentTheme) => ({ ...currentTheme, backgroundColor: event.target.value }))
                }
                type="color"
                value={theme.backgroundColor}
              />
            </label>
            <label>
              Show Grid
              <input checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} type="checkbox" />
            </label>
            <label>
              Snap To Grid
              <input checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} type="checkbox" />
            </label>
            <label>
              Grid Size
              <select onChange={(event) => setGridSize(Number(event.target.value))} value={gridSize}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
              </select>
            </label>
            <label>
              Safe Area
              <input
                checked={showSafeArea}
                onChange={(event) => setShowSafeArea(event.target.checked)}
                type="checkbox"
              />
            </label>
          </div>

          <div className="theme-canvas-frame">
            <div
              className="theme-design-canvas"
              onPointerMove={updateInteraction}
              onPointerUp={endInteraction}
              onPointerLeave={endInteraction}
              ref={canvasRef}
              style={canvasStyle}
            >
              {showSafeArea ? (
                <div
                  className="theme-safe-area"
                  style={{
                    inset: `${(defaultSafeArea / theme.canvasHeight) * 100}% ${(defaultSafeArea / theme.canvasWidth) * 100}%`
                  }}
                />
              ) : null}
              <div className="theme-center-guide vertical" />
              <div className="theme-center-guide horizontal" />
              {theme.regions.map((region) => {
                const isSelected = region.id === selectedRegion.id;

                return (
                  <div
                    className={isSelected ? "theme-region selected" : "theme-region"}
                    key={region.id}
                    onPointerDown={(event) => beginMove(event, region)}
                    role="button"
                    style={getRegionStyle(region)}
                    tabIndex={0}
                  >
                    <span className="theme-region-name">{region.name}</span>
                    {isSelected && isInteracting ? (
                      <span className="theme-region-label">
                        x {region.x} y {region.y} | {region.width} x {region.height}
                      </span>
                    ) : null}
                    {isSelected
                      ? resizeHandles.map((handle) => (
                          <button
                            aria-label={`Resize ${handle}`}
                            className={`theme-resize-handle ${handle}`}
                            key={handle}
                            onPointerDown={(event) => beginResize(event, handle, region)}
                            type="button"
                          />
                        ))
                      : null}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="theme-property-panel" aria-label="Region properties">
            <h3>Properties</h3>
            <label>
              Region Name
              <input
                onChange={(event) => updateSelectedRegion("name", event.target.value)}
                type="text"
                value={selectedRegion.name}
              />
            </label>
            <label>
              Region Type
              <input readOnly type="text" value={selectedRegion.type} />
            </label>

            <div className="theme-property-toggles">
              <label>
                Visible
                <input
                  checked={selectedRegion.visible !== false}
                  onChange={(event) => patchSelectedRegion({ visible: event.target.checked })}
                  type="checkbox"
                />
              </label>
              <label>
                Locked
                <input
                  checked={selectedRegion.locked === true}
                  onChange={(event) => patchSelectedRegion({ locked: event.target.checked })}
                  type="checkbox"
                />
              </label>
            </div>

            <div className="theme-property-actions">
              <button onClick={duplicateSelectedRegion} type="button">
                Duplicate
              </button>
              <button
                disabled={selectedRegion.type === "program" && programRegionCount <= 1}
                onClick={deleteSelectedRegion}
                type="button"
              >
                Delete
              </button>
            </div>

            <div className="theme-align-tools">
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("left")} type="button">Align Left</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("right")} type="button">Align Right</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("top")} type="button">Align Top</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("bottom")} type="button">Align Bottom</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("center-x")} type="button">Center H</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("center-y")} type="button">Center V</button>
              <button disabled={selectedRegion.type !== "program"} onClick={() => alignSelectedRegion("match")} type="button">Match Canvas</button>
              <button disabled type="button">Distribute - Coming later</button>
            </div>

            {(selectedRegion.type === "logo" || selectedRegion.type === "image") ? (
              <div className="theme-dynamic-properties">
                <label>
                  Image
                  <select
                    onChange={(event) => {
                      const media = mediaItems.find((item) => item.id === event.target.value);
                      patchSelectedRegion({
                        mediaId: media?.id,
                        file: media?.filename
                      });
                    }}
                    value={selectedRegionMedia?.id ?? ""}
                  >
                    <option value="">Select image</option>
                    {mediaItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="theme-selected-media">
                  <span>Selected file</span>
                  <strong>{selectedRegion.file ?? selectedRegionMedia?.filename ?? "No image selected"}</strong>
                  <button
                    disabled={!selectedRegion.file && !selectedRegion.mediaId}
                    onClick={() => patchSelectedRegion({ mediaId: undefined, file: undefined })}
                    type="button"
                  >
                    Clear image
                  </button>
                  <button onClick={() => void loadMedia()} type="button">
                    Refresh media
                  </button>
                </div>
                {selectedRegionMediaMissing ? (
                  <p className="theme-warning-text">
                    Selected image is not in the Media Library: {selectedRegion.file}
                  </p>
                ) : null}
                <label>
                  Object Fit
                  <select
                    onChange={(event) => patchSelectedRegion({ objectFit: event.target.value as ThemeObjectFit })}
                    value={selectedRegion.objectFit ?? "contain"}
                  >
                    {objectFitOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Opacity
                  <input
                    max="1"
                    min="0"
                    onChange={(event) => patchSelectedRegion({ opacity: Number(event.target.value) })}
                    step="0.05"
                    type="number"
                    value={selectedRegion.opacity ?? 1}
                  />
                </label>
              </div>
            ) : null}

            {selectedRegion.type === "text" ? (
              <div className="theme-dynamic-properties">
                <label>
                  Text
                  <textarea
                    onChange={(event) => patchSelectedRegion({ text: event.target.value })}
                    rows={4}
                    value={selectedRegion.text ?? ""}
                  />
                </label>
                <label>
                  Font
                  <input
                    onChange={(event) => patchSelectedRegion({ font: event.target.value })}
                    type="text"
                    value={selectedRegion.font ?? "Inter"}
                  />
                </label>
                <label>
                  Font Size
                  <input
                    min="1"
                    onChange={(event) => patchSelectedRegion({ fontSize: Number(event.target.value) })}
                    type="number"
                    value={selectedRegion.fontSize ?? 64}
                  />
                </label>
                <div className="theme-property-toggles">
                  <label>
                    Bold
                    <input
                      checked={selectedRegion.bold === true}
                      onChange={(event) => patchSelectedRegion({ bold: event.target.checked })}
                      type="checkbox"
                    />
                  </label>
                  <label>
                    Italic
                    <input
                      checked={selectedRegion.italic === true}
                      onChange={(event) => patchSelectedRegion({ italic: event.target.checked })}
                      type="checkbox"
                    />
                  </label>
                </div>
                <label>
                  Alignment
                  <select
                    onChange={(event) => patchSelectedRegion({ align: event.target.value as ThemeTextAlign })}
                    value={selectedRegion.align ?? "center"}
                  >
                    {textAlignOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Text Color
                  <input
                    onChange={(event) => patchSelectedRegion({ textColor: event.target.value })}
                    type="color"
                    value={selectedRegion.textColor ?? "#ffffff"}
                  />
                </label>
                <label>
                  Background Color
                  <input
                    onChange={(event) => patchSelectedRegion({ backgroundColor: event.target.value })}
                    type="color"
                    value={selectedRegion.backgroundColor ?? "#000000"}
                  />
                </label>
                <label>
                  Padding
                  <input
                    min="0"
                    onChange={(event) => patchSelectedRegion({ padding: Number(event.target.value) })}
                    type="number"
                    value={selectedRegion.padding ?? 0}
                  />
                </label>
                <label>
                  Corner Radius
                  <input
                    min="0"
                    onChange={(event) => patchSelectedRegion({ cornerRadius: Number(event.target.value) })}
                    type="number"
                    value={selectedRegion.cornerRadius ?? 0}
                  />
                </label>
              </div>
            ) : null}

            {selectedRegion.type === "program" ? (
              <div className="theme-disabled-properties">
              <label>
                Opacity
                <input disabled value="Coming later" readOnly />
              </label>
              <label>
                Corner Radius
                <input disabled value="Coming later" readOnly />
              </label>
              <label>
                Padding
                <input disabled value="Coming later" readOnly />
              </label>
              <label>
                Object Fit
                <input disabled value="Coming later" readOnly />
              </label>
              </div>
            ) : null}

            <details className="theme-advanced-panel" open={isAdvancedOpen} onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}>
              <summary>Advanced</summary>
              <div className="theme-form-grid">
              <label>
                Orientation
                <select
                  onChange={(event) => updateOrientation(event.target.value === "portrait" ? "portrait" : "landscape")}
                  value={theme.orientation}
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </label>

              <label>
                Canvas width
                <input
                  min="1"
                  onChange={(event) =>
                    updateTheme((currentTheme) => ({ ...currentTheme, canvasWidth: Number(event.target.value) }))
                  }
                  type="number"
                  value={theme.canvasWidth}
                />
              </label>

              <label>
                Canvas height
                <input
                  min="1"
                  onChange={(event) =>
                    updateTheme((currentTheme) => ({ ...currentTheme, canvasHeight: Number(event.target.value) }))
                  }
                  type="number"
                  value={theme.canvasHeight}
                />
              </label>

              <label>
                X
                <input
                  type="number"
                  value={selectedRegion.x}
                  onChange={(event) => updateSelectedRegion("x", Number(event.target.value))}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={selectedRegion.y}
                  onChange={(event) => updateSelectedRegion("y", Number(event.target.value))}
                />
              </label>
              <label>
                Width
                <input
                  min="1"
                  type="number"
                  value={selectedRegion.width}
                  onChange={(event) => updateSelectedRegion("width", Number(event.target.value))}
                />
              </label>
              <label>
                Height
                <input
                  min="1"
                  type="number"
                  value={selectedRegion.height}
                  onChange={(event) => updateSelectedRegion("height", Number(event.target.value))}
                />
              </label>
              </div>
              <pre className="theme-json-preview">{JSON.stringify(theme, null, 2)}</pre>
            </details>
          </aside>

          <div className="playlist-actions">
            <button disabled={isBusy} onClick={() => void saveTheme()} type="button">
              Save Theme
            </button>
            <button disabled={isBusy || theme.id === defaultThemeId} onClick={() => void deleteTheme()} type="button">
              Delete Theme
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
