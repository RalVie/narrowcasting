import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { apiUrl } from "../api/apiBase";
import { readApiError } from "../api/readApiError";
import type { PlaylistRecord } from "../playlistTypes";
import type { Program } from "../programTypes";
import type { Theme } from "../themeTypes";

const refreshIntervalMs = 10_000;
type ViewMode = "library" | "editor";
type PendingNavigation =
  | { type: "back" }
  | {
      type: "open";
      program: Program;
    };

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return "0 sec";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remainingSeconds} sec`;
}

function playlistDurationSeconds(playlist?: PlaylistRecord) {
  if (!playlist) {
    return 0;
  }

  return playlist.items.reduce((total, item) => {
    if (item.type === "web_url" && item.duration <= 0) {
      return total;
    }

    return total + Math.max(0, Math.round(item.duration ?? 0));
  }, 0);
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

function getProgramUpdatedAt(program: Program) {
  const candidate = (program as Program & { updatedAt?: unknown }).updatedAt;
  return typeof candidate === "string" ? candidate : undefined;
}

export function ProgramsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [status, setStatus] = useState("Loading programs...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [programSearch, setProgramSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [isAddPlaylistsOpen, setIsAddPlaylistsOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [renameTarget, setRenameTarget] = useState<Program | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const selectedProgramIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);
  const programDraftRef = useRef<Program | null>(null);
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

  function getPlaylist(playlistId: string) {
    return playlists.find((playlist) => playlist.id === playlistId);
  }

  function themeName(themeId: string | undefined) {
    if (!themeId) {
      return "Default Theme";
    }

    return themes.find((theme) => theme.id === themeId)?.name ?? `Missing theme: ${themeId}`;
  }

  function programDuration(programRecord: Program) {
    const totalSeconds = programRecord.playlistIds.reduce((total, playlistId) => total + playlistDurationSeconds(getPlaylist(playlistId)), 0);
    return formatDuration(totalSeconds);
  }

  function openProgram(programRecord: Program, options: { discardDirty?: boolean } = {}) {
    if (isDirtyRef.current && !options.discardDirty) {
      setPendingNavigation({ type: "open", program: programRecord });
      return;
    }

    const draft = {
      ...programRecord,
      playlistIds: [...programRecord.playlistIds]
    };
    selectedProgramIdRef.current = draft.id;
    programDraftRef.current = draft;
    setSelectedProgramId(draft.id);
    setProgram(draft);
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
    setIsAddPlaylistsOpen(false);
    setIsThemeModalOpen(false);
    setSelectedPlaylistIds([]);
    isDirtyRef.current = false;
    setIsDirty(false);
  }

  async function loadData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      const playlistResponse = await fetch(apiUrl("/api/playlists")).catch(() => null);
      const themeResponse = await fetch(apiUrl("/api/themes")).catch(() => null);

      if (playlistResponse?.ok) {
        setPlaylists((await playlistResponse.json()) as PlaylistRecord[]);
      }

      if (themeResponse?.ok) {
        setThemes((await themeResponse.json()) as Theme[]);
      }

      return;
    }

    setIsBusy(true);

    try {
      const [playlistResponse, programResponse, themeResponse] = await Promise.all([
        fetch(apiUrl("/api/playlists")),
        fetch(apiUrl("/api/programs")),
        fetch(apiUrl("/api/themes"))
      ]);

      if (!playlistResponse.ok || !programResponse.ok || !themeResponse.ok) {
        throw new Error("program data unavailable");
      }

      const playlistBody = (await playlistResponse.json()) as PlaylistRecord[];
      const programBody = (await programResponse.json()) as Program[];
      const themeBody = (await themeResponse.json()) as Theme[];
      setPlaylists(playlistBody);
      setPrograms(programBody);
      setThemes(themeBody);

      if (selectedProgramIdRef.current) {
        const currentProgram = programBody.find((item) => item.id === selectedProgramIdRef.current);

        if (currentProgram && viewMode === "editor") {
          const draft = { ...currentProgram, playlistIds: [...currentProgram.playlistIds] };
          programDraftRef.current = draft;
          setProgram(draft);
        }
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Programs loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load programs: ${error.message}` : "Unable to load programs.");
    } finally {
      setIsBusy(false);
    }
  }

  async function createProgram(name = "New Program", playlistIds: string[] = [], themeId?: string) {
    setIsBusy(true);
    setStatus("Creating program...");

    try {
      const response = await fetch(apiUrl("/api/programs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, playlistIds, themeId })
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as Program;
      setPrograms((currentPrograms) => [...currentPrograms, body]);
      openProgram(body, { discardDirty: true });
      setStatus(`${body.name} created.`);
      return body;
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function duplicateProgram(source: Program) {
    await createProgram(`${source.name} Copy`, source.playlistIds, source.themeId);
  }

  async function saveProgram(currentProgram = programDraftRef.current) {
    if (!currentProgram) {
      return null;
    }

    setIsBusy(true);
    setStatus(`Saving ${currentProgram.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(currentProgram.id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentProgram)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Program;
      const savedProgram = { ...body, playlistIds: [...body.playlistIds] };
      programDraftRef.current = savedProgram;
      setProgram(savedProgram);
      setPrograms((currentPrograms) =>
        currentPrograms.some((item) => item.id === savedProgram.id)
          ? currentPrograms.map((item) => (item.id === savedProgram.id ? savedProgram : item))
          : [...currentPrograms, savedProgram]
      );
      selectedProgramIdRef.current = savedProgram.id;
      setSelectedProgramId(savedProgram.id);
      isDirtyRef.current = false;
      setIsDirty(false);
      showSavedStatus();
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
      return savedProgram;
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function renameProgram() {
    if (!renameTarget) {
      return;
    }

    const name = renameValue.trim();

    if (!name) {
      setStatus("Program name cannot be empty.");
      return;
    }

    setRenameTarget(null);
    await saveProgram({ ...renameTarget, name });
  }

  async function deleteProgram(target: Program) {
    setIsBusy(true);
    setStatus(`Deleting ${target.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(target.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setPrograms((currentPrograms) => currentPrograms.filter((item) => item.id !== target.id));

      if (selectedProgramIdRef.current === target.id) {
        selectedProgramIdRef.current = null;
        programDraftRef.current = null;
        setSelectedProgramId(null);
        setProgram(null);
        setViewMode("library");
        isDirtyRef.current = false;
        setIsDirty(false);
      }

      setDeleteTarget(null);
      setStatus(`${target.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateProgram(updater: (program: Program) => Program) {
    if (!programDraftRef.current) {
      return;
    }

    const nextProgram = updater(programDraftRef.current);
    programDraftRef.current = nextProgram;
    setProgram(nextProgram);
    markDirty();
  }

  function addPlaylists(playlistIds: string[]) {
    if (playlistIds.length === 0) {
      return;
    }

    updateProgram((currentProgram) => ({
      ...currentProgram,
      playlistIds: [...currentProgram.playlistIds, ...playlistIds]
    }));
    setSelectedPlaylistIds([]);
    setIsAddPlaylistsOpen(false);
    setStatus(`Added ${playlistIds.length} playlist(s).`);
  }

  function removePlaylist(index: number) {
    updateProgram((currentProgram) => ({
      ...currentProgram,
      playlistIds: currentProgram.playlistIds.filter((_, playlistIndex) => playlistIndex !== index)
    }));
  }

  function reorderPlaylist(fromIndex: number, toIndex: number) {
    updateProgram((currentProgram) => {
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= currentProgram.playlistIds.length) {
        return currentProgram;
      }

      const playlistIds = [...currentProgram.playlistIds];
      const [playlistId] = playlistIds.splice(fromIndex, 1);
      playlistIds.splice(Math.min(toIndex, playlistIds.length), 0, playlistId);
      return { ...currentProgram, playlistIds };
    });
  }

  function selectTheme(themeId: string | undefined) {
    updateProgram((currentProgram) => ({
      ...currentProgram,
      themeId
    }));
    setIsThemeModalOpen(false);
  }

  function handleProgramPlaylistDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-program-playlist-index", String(index));
  }

  function handleProgramPlaylistDrop(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const draggedIndex = event.dataTransfer.getData("application/x-program-playlist-index");

    if (draggedIndex) {
      reorderPlaylist(Number(draggedIndex), index);
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
      const saved = await saveProgram();

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
      openProgram(pending.program, { discardDirty: true });
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => clearSavedStatusTimer(), []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const filteredPrograms = programs.filter((item) =>
    programSearch.trim() ? item.name.toLowerCase().includes(programSearch.trim().toLowerCase()) : true
  );
  const filteredPlaylists = playlists.filter((item) =>
    playlistSearch.trim() ? item.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()) : true
  );
  const selectedPlaylists = selectedPlaylistIds.map(getPlaylist).filter((item): item is PlaylistRecord => Boolean(item));
  const selectedThemeMissing = Boolean(program?.themeId && !themes.some((theme) => theme.id === program.themeId));

  function renderProgramCard(programRecord: Program) {
    const previews = programRecord.playlistIds.slice(0, 4).map(getPlaylist);

    return (
      <article className="playlist-library-card" key={programRecord.id}>
        <button className="playlist-library-open" onClick={() => openProgram(programRecord)} type="button">
          <div className="playlist-preview-strip" aria-hidden="true">
            {previews.length > 0 ? (
              previews.map((playlist, index) => (
                <div className="playlist-preview-thumb" key={`${programRecord.id}-${index}`}>
                  <span>{playlist?.items.length ?? 0} items</span>
                </div>
              ))
            ) : (
              <div className="playlist-preview-thumb empty">Empty</div>
            )}
          </div>
          <div className="playlist-library-main">
            <strong>{programRecord.name}</strong>
            <span>
              {programRecord.playlistIds.length} playlist(s) - Theme: {themeName(programRecord.themeId)}
            </span>
            <span>Estimated duration: {programDuration(programRecord)}</span>
            <span>Last modified: {formatUpdatedAt(getProgramUpdatedAt(programRecord))}</span>
          </div>
        </button>
        <details className="playlist-card-menu">
          <summary aria-label={`Actions for ${programRecord.name}`}>...</summary>
          <div>
            <button onClick={() => openProgram(programRecord)} type="button">
              Open
            </button>
            <button disabled={isBusy} onClick={() => void duplicateProgram(programRecord)} type="button">
              Duplicate
            </button>
            <button
              disabled={isBusy}
              onClick={() => {
                setRenameTarget(programRecord);
                setRenameValue(programRecord.name);
              }}
              type="button"
            >
              Rename
            </button>
            <button disabled={isBusy} onClick={() => setDeleteTarget(programRecord)} type="button">
              Delete
            </button>
          </div>
        </details>
      </article>
    );
  }

  function renderProgramPlaylist(playlistId: string, index: number) {
    const playlist = getPlaylist(playlistId);

    return (
      <article
        className="program-editor-row"
        draggable
        key={`${program?.id}-${playlistId}-${index}`}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => handleProgramPlaylistDragStart(event, index)}
        onDrop={(event) => handleProgramPlaylistDrop(event, index)}
      >
        <span className="operator-drag-handle" title="Drag to reorder">
          Drag
        </span>
        <div className="operator-item-main">
          <strong>{playlist?.name ?? playlistId}</strong>
          <span>
            {playlist?.items.length ?? 0} item(s) - {formatDuration(playlistDurationSeconds(playlist))}
          </span>
        </div>
        <button disabled={isBusy} onClick={() => removePlaylist(index)} type="button">
          Remove
        </button>
      </article>
    );
  }

  function renderPlaylistPickerRow(playlist: PlaylistRecord) {
    const selected = selectedPlaylistIds.includes(playlist.id);

    return (
      <button
        className={selected ? "program-picker-row selected" : "program-picker-row"}
        key={playlist.id}
        onClick={() =>
          setSelectedPlaylistIds((currentIds) =>
            currentIds.includes(playlist.id) ? currentIds.filter((playlistId) => playlistId !== playlist.id) : [...currentIds, playlist.id]
          )
        }
        type="button"
      >
        <strong>{playlist.name}</strong>
        <span>
          {playlist.items.length} item(s) - {formatDuration(playlistDurationSeconds(playlist))}
        </span>
      </button>
    );
  }

  return (
    <section className="page-section operator-section" id="programs">
      {viewMode === "library" ? (
        <>
          <div className="section-header">
            <div>
              <h2>Programs</h2>
              <p>Arrange playlists and themes into reusable playback programs.</p>
            </div>
            <div className="button-row">
              <button disabled={isBusy} onClick={() => void loadData({ force: true })} type="button">
                Refresh
              </button>
              <button className="primary-button" disabled={isBusy} onClick={() => void createProgram()} type="button">
                + New Program
              </button>
            </div>
          </div>

          <p className="status-text">{status}</p>

          <div className="playlist-library-toolbar">
            <input
              aria-label="Search programs"
              onChange={(event) => setProgramSearch(event.target.value)}
              placeholder="Search programs"
              type="search"
              value={programSearch}
            />
            <span>{filteredPrograms.length} program(s)</span>
          </div>

          <div className="playlist-library-grid">
            {filteredPrograms.length > 0 ? (
              filteredPrograms.map(renderProgramCard)
            ) : (
              <p className="operator-empty">No programs found. Create a new program to start arranging playlists.</p>
            )}
          </div>
        </>
      ) : program ? (
        <>
          <div className="playlist-editor-header program-editor-header">
            <button onClick={() => backToLibrary()} type="button">
              ← Back to Programs
            </button>
            <div className="playlist-editor-title-row">
              <input
                aria-label="Program name"
                className="operator-title-input"
                onChange={(event) =>
                  updateProgram((currentProgram) => ({
                    ...currentProgram,
                    name: event.target.value
                  }))
                }
                value={program.name}
              />
              <span>
                {program.playlistIds.length} playlist(s) - Theme: {themeName(program.themeId)}
              </span>
            </div>
            <div className="button-row">
              <button disabled={isBusy} onClick={() => setIsAddPlaylistsOpen(true)} type="button">
                Add Playlists
              </button>
              <button disabled={isBusy} onClick={() => setIsThemeModalOpen(true)} type="button">
                Change Theme
              </button>
              <details className="playlist-card-menu playlist-editor-menu">
                <summary aria-label={`Actions for ${program.name}`}>...</summary>
                <div>
                  <button
                    disabled={isBusy}
                    onClick={() => {
                      setRenameTarget(program);
                      setRenameValue(program.name);
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button disabled={isBusy} onClick={() => void duplicateProgram(program)} type="button">
                    Duplicate
                  </button>
                  <button disabled={isBusy} onClick={() => setDeleteTarget(program)} type="button">
                    Delete
                  </button>
                </div>
              </details>
              <button className="primary-button" disabled={isBusy || !isDirty} onClick={() => void saveProgram()} type="button">
                Save Changes
              </button>
            </div>
          </div>

          <p className="status-text">
            {status}
            {isDirty ? " Unsaved changes." : ""}
          </p>

          <section className="program-theme-summary" aria-label="Program theme">
            <div>
              <span>Theme</span>
              <strong>{themeName(program.themeId)}</strong>
              {selectedThemeMissing ? <p>Selected theme is missing. Runtime will use the default until a valid theme is selected.</p> : null}
            </div>
            <button disabled={isBusy} onClick={() => setIsThemeModalOpen(true)} type="button">
              Change Theme
            </button>
          </section>

          <div className="playlist-editor-list">
            {program.playlistIds.length > 0 ? (
              program.playlistIds.map(renderProgramPlaylist)
            ) : (
              <p className="operator-empty">No playlists in this program yet. Use Add Playlists to choose them.</p>
            )}
          </div>
        </>
      ) : null}

      {isAddPlaylistsOpen ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal playlist-media-modal" role="dialog">
            <div className="playlist-modal-header">
              <div>
                <h3>Add playlists</h3>
                <p>Select one or more playlists to append to this program.</p>
              </div>
              <button
                aria-label="Close add playlists"
                onClick={() => {
                  setIsAddPlaylistsOpen(false);
                  setSelectedPlaylistIds([]);
                }}
                type="button"
              >
                Close
              </button>
            </div>
            <input
              aria-label="Search playlists"
              onChange={(event) => setPlaylistSearch(event.target.value)}
              placeholder="Search playlists"
              type="search"
              value={playlistSearch}
            />
            <div className="program-picker-list">
              {filteredPlaylists.length > 0 ? filteredPlaylists.map(renderPlaylistPickerRow) : <p className="operator-empty">No playlists found.</p>}
            </div>
            <div className="media-trash-modal-actions">
              <button
                onClick={() => {
                  setIsAddPlaylistsOpen(false);
                  setSelectedPlaylistIds([]);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={selectedPlaylists.length === 0}
                onClick={() => addPlaylists(selectedPlaylists.map((playlist) => playlist.id))}
                type="button"
              >
                Add selected playlists
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isThemeModalOpen ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Change Theme</h3>
            <div className="program-theme-list">
              <button className={!program?.themeId ? "selected" : ""} onClick={() => selectTheme(undefined)} type="button">
                <strong>Default Theme</strong>
                <span>Use the runtime default layout.</span>
              </button>
              {themes.map((theme) => (
                <button
                  className={program?.themeId === theme.id ? "selected" : ""}
                  key={theme.id}
                  onClick={() => selectTheme(theme.id)}
                  type="button"
                >
                  <strong>{theme.name}</strong>
                  <span>{theme.regions.length} region(s)</span>
                </button>
              ))}
            </div>
            <div className="media-trash-modal-actions">
              <button onClick={() => setIsThemeModalOpen(false)} type="button">
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingNavigation ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Unsaved changes</h3>
            <p>This program has changes that have not been saved.</p>
            <div className="media-trash-modal-actions">
              <button onClick={() => void resolvePendingNavigation("cancel")} type="button">
                Cancel
              </button>
              <button className="danger-button" onClick={() => void resolvePendingNavigation("discard")} type="button">
                Discard Changes
              </button>
              <button className="primary-button" disabled={isBusy} onClick={() => void resolvePendingNavigation("save")} type="button">
                Save and Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Rename program</h3>
            <input
              aria-label="Program name"
              onChange={(event) => setRenameValue(event.target.value)}
              type="text"
              value={renameValue}
            />
            <div className="media-trash-modal-actions">
              <button onClick={() => setRenameTarget(null)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={isBusy || !renameValue.trim()} onClick={() => void renameProgram()} type="button">
                Rename
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="media-trash-modal-backdrop" role="presentation">
          <section aria-modal="true" className="media-trash-modal" role="dialog">
            <h3>Delete program</h3>
            <p>Delete "{deleteTarget.name}"? This does not delete playlists or media.</p>
            <div className="media-trash-modal-actions">
              <button onClick={() => setDeleteTarget(null)} type="button">
                Cancel
              </button>
              <button className="danger-button" disabled={isBusy} onClick={() => void deleteProgram(deleteTarget)} type="button">
                Delete Program
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}