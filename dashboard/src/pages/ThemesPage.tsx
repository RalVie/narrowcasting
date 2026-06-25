import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { Theme, ThemeRegion } from "../themeTypes";

const refreshIntervalMs = 10_000;
const defaultThemeId = "default-fullscreen";

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
  const selectedThemeIdRef = useRef(defaultThemeId);
  const isDirtyRef = useRef(false);

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

      <article className="program-card">
        <div className="theme-form-grid">
          <label>
            Edit theme
            <select
              disabled={isBusy}
              onChange={(event) => {
                const nextTheme = themes.find((item) => item.id === event.target.value);

                if (nextTheme) {
                  selectTheme(nextTheme);
                  isDirtyRef.current = false;
                  setIsDirty(false);
                }
              }}
              value={selectedThemeId}
            >
              {themes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Theme name
            <input
              onChange={(event) => updateTheme((currentTheme) => ({ ...currentTheme, name: event.target.value }))}
              type="text"
              value={theme.name}
            />
          </label>

          <label>
            Orientation
            <select
              onChange={(event) =>
                updateTheme((currentTheme) => ({
                  ...currentTheme,
                  orientation: event.target.value === "portrait" ? "portrait" : "landscape"
                }))
              }
              value={theme.orientation}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
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
        </div>

        <div className="theme-region-grid">
          <h3>Main Program Region</h3>
          <label>
            X
            <input type="number" value={mainRegion.x} onChange={(event) => updateMainRegion("x", Number(event.target.value))} />
          </label>
          <label>
            Y
            <input type="number" value={mainRegion.y} onChange={(event) => updateMainRegion("y", Number(event.target.value))} />
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

        <div className="playlist-actions">
          <button disabled={isBusy} onClick={() => void saveTheme()} type="button">
            Save Theme
          </button>
          <button disabled={isBusy || theme.id === defaultThemeId} onClick={() => void deleteTheme()} type="button">
            Delete Theme
          </button>
        </div>
      </article>
    </section>
  );
}
