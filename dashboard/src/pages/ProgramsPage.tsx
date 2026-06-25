import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { apiUrl } from "../api/apiBase";
import type { PlaylistRecord } from "../playlistTypes";
import type { Program } from "../programTypes";

const refreshIntervalMs = 10_000;

export function ProgramsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState("default-program");
  const [program, setProgram] = useState<Program>({
    id: "default-program",
    name: "Default Program",
    playlistIds: ["default"]
  });
  const [status, setStatus] = useState("Loading programs...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [programSearch, setProgramSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const selectedProgramIdRef = useRef("default-program");
  const isDirtyRef = useRef(false);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function selectProgram(programRecord: Program) {
    selectedProgramIdRef.current = programRecord.id;
    setSelectedProgramId(programRecord.id);
    setProgram(programRecord);
  }

  async function loadData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      const playlistResponse = await fetch(apiUrl("/api/playlists")).catch(() => null);

      if (playlistResponse?.ok) {
        setPlaylists((await playlistResponse.json()) as PlaylistRecord[]);
      }

      return;
    }

    setIsBusy(true);

    try {
      const [playlistResponse, programResponse] = await Promise.all([
        fetch(apiUrl("/api/playlists")),
        fetch(apiUrl("/api/programs"))
      ]);

      if (!playlistResponse.ok || !programResponse.ok) {
        throw new Error("program data unavailable");
      }

      const playlistBody = (await playlistResponse.json()) as PlaylistRecord[];
      const programBody = (await programResponse.json()) as Program[];
      const selectedProgram =
        programBody.find((item) => item.id === selectedProgramIdRef.current) ??
        programBody.find((item) => item.id === "default-program") ??
        programBody[0];

      setPlaylists(playlistBody);
      setPrograms(programBody);

      if (selectedProgram) {
        selectProgram(selectedProgram);
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

  async function createProgram(name = "New Program", playlistIds: string[] = []) {
    setIsBusy(true);
    setStatus("Creating program...");

    try {
      const response = await fetch(apiUrl("/api/programs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, playlistIds })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Program;
      selectProgram(body);
      setPrograms((currentPrograms) => [...currentPrograms, body]);
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`${body.name} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function duplicateProgram() {
    await createProgram(`${program.name} Copy`, program.playlistIds);
  }

  async function saveProgram() {
    setIsBusy(true);
    setStatus(`Saving ${program.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(program.id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(program)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Program;
      selectProgram(body);
      setPrograms((currentPrograms) => currentPrograms.map((item) => (item.id === body.id ? body : item)));
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`${program.name} saved.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteProgram() {
    if (!window.confirm(`Delete program "${program.name}"?`)) {
      return;
    }

    setIsBusy(true);
    setStatus(`Deleting ${program.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(program.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const nextPrograms = programs.filter((item) => item.id !== program.id);
      const nextProgram = nextPrograms.find((item) => item.id === "default-program") ?? nextPrograms[0];
      setPrograms(nextPrograms);

      if (nextProgram) {
        selectProgram(nextProgram);
      }

      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`${program.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateProgram(updater: (program: Program) => Program) {
    setProgram((currentProgram) => updater(currentProgram));
    markDirty();
  }

  function addPlaylist(playlistId: string, index = program.playlistIds.length) {
    if (!playlistId) {
      return;
    }

    updateProgram((currentProgram) => {
      const playlistIds = [...currentProgram.playlistIds];
      playlistIds.splice(index, 0, playlistId);
      return { ...currentProgram, playlistIds };
    });
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

  function playlistName(playlistId: string) {
    return playlists.find((playlist) => playlist.id === playlistId)?.name ?? playlistId;
  }

  function handlePlaylistDragStart(event: DragEvent<HTMLElement>, playlistId: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-playlist-id", playlistId);
  }

  function handleProgramPlaylistDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-program-playlist-index", String(index));
  }

  function handleProgramDrop(event: DragEvent<HTMLElement>, index = program.playlistIds.length) {
    event.preventDefault();
    const playlistId = event.dataTransfer.getData("application/x-playlist-id");
    const draggedIndex = event.dataTransfer.getData("application/x-program-playlist-index");

    if (playlistId) {
      addPlaylist(playlistId, index);
      return;
    }

    if (draggedIndex) {
      reorderPlaylist(Number(draggedIndex), index);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  const filteredPrograms = programs.filter((item) =>
    programSearch.trim() ? item.name.toLowerCase().includes(programSearch.trim().toLowerCase()) : true
  );
  const filteredPlaylists = playlists.filter((item) =>
    playlistSearch.trim() ? item.name.toLowerCase().includes(playlistSearch.trim().toLowerCase()) : true
  );

  return (
    <section className="page-section operator-section" id="programs">
      <div className="section-header">
        <div>
          <h2>Program Builder</h2>
          <p>Assemble playlists into the program the scheduler will activate.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void loadData({ force: true })} type="button">
            Refresh
          </button>
          <button disabled={isBusy} onClick={() => void saveProgram()} type="button">
            Save Program
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="operator-workspace program-workspace">
        <section className="operator-panel playlist-browser" aria-label="Programs">
          <div className="operator-panel-header">
            <h3>Programs</h3>
            <span>{programs.length}</span>
          </div>
          <input
            aria-label="Search programs"
            onChange={(event) => setProgramSearch(event.target.value)}
            placeholder="Search programs"
            type="search"
            value={programSearch}
          />
          <div className="operator-action-grid">
            <button disabled={isBusy} onClick={() => void createProgram()} type="button">
              New Program
            </button>
            <button disabled={isBusy} onClick={() => void duplicateProgram()} type="button">
              Duplicate
            </button>
            <button disabled={isBusy} onClick={() => void deleteProgram()} type="button">
              Delete
            </button>
          </div>
          <div className="operator-list">
            {filteredPrograms.map((item) => (
              <button
                className={item.id === selectedProgramId ? "operator-list-item active" : "operator-list-item"}
                key={item.id}
                onClick={() => {
                  selectProgram(item);
                  isDirtyRef.current = false;
                  setIsDirty(false);
                }}
                type="button"
              >
                <strong>{item.name}</strong>
                <span>{item.playlistIds.length} playlist(s)</span>
              </button>
            ))}
          </div>
        </section>

        <section className="operator-panel playlist-browser" aria-label="Available playlists">
          <div className="operator-panel-header">
            <h3>Playlists</h3>
            <span>{filteredPlaylists.length} available</span>
          </div>
          <input
            aria-label="Search playlists"
            onChange={(event) => setPlaylistSearch(event.target.value)}
            placeholder="Search playlists"
            type="search"
            value={playlistSearch}
          />
          <div className="operator-list">
            {filteredPlaylists.map((playlist) => (
              <article
                className="operator-list-card"
                draggable
                key={playlist.id}
                onDragStart={(event) => handlePlaylistDragStart(event, playlist.id)}
              >
                <strong>{playlist.name}</strong>
                <span>{playlist.items.length} item(s)</span>
              </article>
            ))}
          </div>
        </section>

        <section
          className="operator-panel playlist-content-panel"
          aria-label="Program playlists"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleProgramDrop(event)}
        >
          <div className="operator-panel-header">
            <div>
              <h3>{program.name}</h3>
              <span>{program.playlistIds.length} playlist(s)</span>
            </div>
            <button disabled={isBusy} onClick={() => void saveProgram()} type="button">
              Save
            </button>
          </div>
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
          <div className="operator-drop-zone">Drop playlists here</div>
          <div className="operator-timeline">
            {program.playlistIds.length === 0 ? <p className="operator-empty">No playlists yet. Drag playlists into this program.</p> : null}
            {program.playlistIds.map((playlistId, index) => (
              <article
                className="operator-timeline-row"
                draggable
                key={`${program.id}-${playlistId}-${index}`}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => handleProgramPlaylistDragStart(event, index)}
                onDrop={(event) => handleProgramDrop(event, index)}
              >
                <span className="operator-drag-handle">Drag</span>
                <div className="operator-item-main">
                  <strong>{playlistName(playlistId)}</strong>
                  <span>{playlists.find((item) => item.id === playlistId)?.items.length ?? 0} item(s)</span>
                </div>
                <button disabled={isBusy} onClick={() => removePlaylist(index)} type="button">
                  Remove
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
