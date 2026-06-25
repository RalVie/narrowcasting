import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { apiUrl } from "../api/apiBase";
import type { Theme, ThemeRegion } from "../themeTypes";

const refreshIntervalMs = 10_000;
const defaultThemeId = "default-fullscreen";
const minimumRegionSize = 40;
const defaultSafeArea = 80;
const resizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

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
      height: theme.canvasHeight
    }
  );
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

export function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([]);
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
        height: 1080
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
  const [isRegionSelected, setIsRegionSelected] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);
  const selectedThemeIdRef = useRef(defaultThemeId);
  const isDirtyRef = useRef(false);
  const interactionRef = useRef<Interaction | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function selectTheme(themeRecord: Theme) {
    selectedThemeIdRef.current = themeRecord.id;
    setSelectedThemeId(themeRecord.id);
    setTheme(themeRecord);
  }

  async function loadThemes(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      return;
    }

    setIsBusy(true);

    try {
      const response = await fetch(apiUrl("/api/themes"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Theme[];
      const selectedTheme =
        body.find((item) => item.id === selectedThemeIdRef.current) ??
        body.find((item) => item.id === defaultThemeId) ??
        body[0];

      setThemes(body);

      if (selectedTheme) {
        selectTheme(selectedTheme);
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Themes loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load themes: ${error.message}` : "Unable to load themes.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateTheme(updater: (currentTheme: Theme) => Theme) {
    setTheme((currentTheme) => updater(currentTheme));
    markDirty();
  }

  function updateMainRegionGeometry(region: ThemeRegion) {
    updateTheme((currentTheme) => {
      const otherRegions = currentTheme.regions.filter((item) => item.id !== region.id);

      return {
        ...currentTheme,
        regions: [region, ...otherRegions]
      };
    });
  }

  function updateMainRegion(field: "x" | "y" | "width" | "height", value: number) {
    updateTheme((currentTheme) => {
      const region = {
        ...defaultRegion(currentTheme),
        [field]: value
      };
      const otherRegions = currentTheme.regions.filter((item) => item.id !== region.id);

      return {
        ...currentTheme,
        regions: [region, ...otherRegions]
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

  function beginMove(event: PointerEvent<HTMLDivElement>) {
    if (!canvasRef.current) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = getPointerPosition(event, canvasRef.current, theme);
    interactionRef.current = {
      mode: "move",
      pointerX: pointer.x,
      pointerY: pointer.y,
      region: mainRegion
    };
    setIsRegionSelected(true);
    setIsInteracting(true);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
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
      region: mainRegion
    };
    setIsRegionSelected(true);
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

    updateMainRegionGeometry(constrainRegion(nextRegion));
  }

  function endInteraction() {
    interactionRef.current = null;
    setIsInteracting(false);
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
      await loadThemes({ force: true });
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
      selectTheme(body);
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadThemes({ force: true });
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
    const timer = window.setInterval(() => void loadThemes(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  const mainRegion = defaultRegion(theme);
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
  const regionStyle = {
    left: `${(mainRegion.x / theme.canvasWidth) * 100}%`,
    top: `${(mainRegion.y / theme.canvasHeight) * 100}%`,
    width: `${(mainRegion.width / theme.canvasWidth) * 100}%`,
    height: `${(mainRegion.height / theme.canvasHeight) * 100}%`
  };

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
          <button disabled={isBusy} onClick={() => void loadThemes({ force: true })} type="button">
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
              <div
                className={isRegionSelected ? "theme-region selected" : "theme-region"}
                onPointerDown={beginMove}
                role="button"
                style={regionStyle}
                tabIndex={0}
              >
                <span className="theme-region-name">Program Region</span>
                {isInteracting ? (
                  <span className="theme-region-label">
                    x {mainRegion.x} y {mainRegion.y} | {mainRegion.width} x {mainRegion.height}
                  </span>
                ) : null}
                {isRegionSelected
                  ? resizeHandles.map((handle) => (
                      <button
                        aria-label={`Resize ${handle}`}
                        className={`theme-resize-handle ${handle}`}
                        key={handle}
                        onPointerDown={(event) => beginResize(event, handle)}
                        type="button"
                      />
                    ))
                  : null}
              </div>
            </div>
          </div>

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
                  value={mainRegion.x}
                  onChange={(event) => updateMainRegion("x", Number(event.target.value))}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={mainRegion.y}
                  onChange={(event) => updateMainRegion("y", Number(event.target.value))}
                />
              </label>
              <label>
                Width
                <input
                  min="1"
                  type="number"
                  value={mainRegion.width}
                  onChange={(event) => updateMainRegion("width", Number(event.target.value))}
                />
              </label>
              <label>
                Height
                <input
                  min="1"
                  type="number"
                  value={mainRegion.height}
                  onChange={(event) => updateMainRegion("height", Number(event.target.value))}
                />
              </label>
            </div>
            <pre className="theme-json-preview">{JSON.stringify(theme, null, 2)}</pre>
          </details>

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
