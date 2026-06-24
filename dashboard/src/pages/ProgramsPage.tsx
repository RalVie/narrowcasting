import { useEffect, useRef, useState } from "react";
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

  async function createProgram() {
    setIsBusy(true);
    setStatus("Creating program...");

    try {
      const response = await fetch(apiUrl("/api/programs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Program", playlistIds: [] })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Program;
      selectProgram(body);
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadData({ force: true });
      setStatus(`${body.name} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
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
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadData({ force: true });
      setStatus(`${program.name} saved.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteProgram() {
    setIsBusy(true);
    setStatus(`Deleting ${program.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(program.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      selectedProgramIdRef.current = "default-program";
      setSelectedProgramId("default-program");
      isDirtyRef.current = false;
      setIsDirty(false);
      await loadData({ force: true });
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

  function addPlaylist(playlistId: string) {
    if (!playlistId) {
      return;
    }

    updateProgram((program) => ({
      ...program,
      playlistIds: [...program.playlistIds, playlistId]
    }));
  }

  function removePlaylist(index: number) {
    updateProgram((program) => ({
      ...program,
      playlistIds: program.playlistIds.filter((_, playlistIndex) => playlistIndex !== index)
    }));
  }

  function movePlaylist(index: number, direction: -1 | 1) {
    updateProgram((program) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= program.playlistIds.length) {
        return program;
      }

      const playlistIds = [...program.playlistIds];
      const [playlistId] = playlistIds.splice(index, 1);
      playlistIds.splice(nextIndex, 0, playlistId);

      return { ...program, playlistIds };
    });
  }

  function playlistName(playlistId: string) {
    return playlists.find((playlist) => playlist.id === playlistId)?.name ?? playlistId;
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="page-section" id="programs">
      <div className="section-header">
        <div>
          <h2>Programs</h2>
          <p>Reusable ordered groups of playlists for the scheduler.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void createProgram()} type="button">
            Create Program
          </button>
          <button disabled={isBusy} onClick={() => void loadData({ force: true })} type="button">
            Refresh
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="program-list">
        <article className="program-card" key={program.id}>
          <div className="program-card-header">
            <label>
              Edit program
              <select
                disabled={isBusy}
                onChange={(event) => {
                  const nextProgram = programs.find((item) => item.id === event.target.value);

                  if (nextProgram) {
                    selectProgram(nextProgram);
                    isDirtyRef.current = false;
                    setIsDirty(false);
                  }
                }}
                value={selectedProgramId}
              >
                {programs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Program name
              <input
                onChange={(event) =>
                  updateProgram((currentProgram) => ({
                    ...currentProgram,
                    name: event.target.value
                  }))
                }
                type="text"
                value={program.name}
              />
            </label>
            <div className="playlist-actions">
              <button disabled={isBusy} onClick={() => void saveProgram()} type="button">
                Save Program
              </button>
              <button disabled={isBusy} onClick={() => void deleteProgram()} type="button">
                Delete
              </button>
            </div>
          </div>

          <div className="program-playlists">
            {program.playlistIds.length === 0 ? <p>Empty program.</p> : null}
            {program.playlistIds.map((playlistId, index) => (
              <div className="program-playlist-row" key={`${program.id}-${playlistId}-${index}`}>
                <strong>{playlistName(playlistId)}</strong>
                <div className="playlist-actions">
                  <button disabled={isBusy || index === 0} onClick={() => movePlaylist(index, -1)} type="button">
                    Up
                  </button>
                  <button
                    disabled={isBusy || index === program.playlistIds.length - 1}
                    onClick={() => movePlaylist(index, 1)}
                    type="button"
                  >
                    Down
                  </button>
                  <button disabled={isBusy} onClick={() => removePlaylist(index)} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label>
            Add playlist
            <select disabled={isBusy} onChange={(event) => addPlaylist(event.target.value)} value="">
              <option value="">Choose playlist</option>
              {playlists.map((playlist) => (
                <option key={playlist.id} value={playlist.id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </label>
        </article>
      </div>
    </section>
  );
}
