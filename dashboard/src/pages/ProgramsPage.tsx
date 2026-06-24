import { useEffect, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { PlaylistRecord } from "../playlistTypes";
import type { Program } from "../programTypes";

const refreshIntervalMs = 10_000;

export function ProgramsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [status, setStatus] = useState("Loading programs...");
  const [isBusy, setIsBusy] = useState(false);

  async function loadData() {
    setIsBusy(true);

    try {
      const [playlistResponse, programResponse] = await Promise.all([
        fetch(apiUrl("/api/playlists")),
        fetch(apiUrl("/api/programs"))
      ]);

      if (!playlistResponse.ok || !programResponse.ok) {
        throw new Error("program data unavailable");
      }

      setPlaylists((await playlistResponse.json()) as PlaylistRecord[]);
      setPrograms((await programResponse.json()) as Program[]);
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

      await loadData();
      setStatus("Program created.");
    } catch (error) {
      setStatus(error instanceof Error ? `Create failed: ${error.message}` : "Create failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveProgram(program: Program) {
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

      await loadData();
      setStatus(`${program.name} saved.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteProgram(program: Program) {
    setIsBusy(true);
    setStatus(`Deleting ${program.name}...`);

    try {
      const response = await fetch(apiUrl(`/api/programs/${encodeURIComponent(program.id)}`), {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await loadData();
      setStatus(`${program.name} deleted.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Delete failed: ${error.message}` : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function updateProgram(programId: string, updater: (program: Program) => Program) {
    setPrograms((currentPrograms) =>
      currentPrograms.map((program) => (program.id === programId ? updater(program) : program))
    );
  }

  function addPlaylist(programId: string, playlistId: string) {
    if (!playlistId) {
      return;
    }

    updateProgram(programId, (program) => ({
      ...program,
      playlistIds: [...program.playlistIds, playlistId]
    }));
  }

  function removePlaylist(programId: string, index: number) {
    updateProgram(programId, (program) => ({
      ...program,
      playlistIds: program.playlistIds.filter((_, playlistIndex) => playlistIndex !== index)
    }));
  }

  function movePlaylist(programId: string, index: number, direction: -1 | 1) {
    updateProgram(programId, (program) => {
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
          <button disabled={isBusy} onClick={() => void loadData()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <p className="status-text">{status}</p>

      <div className="program-list">
        {programs.map((program) => (
          <article className="program-card" key={program.id}>
            <div className="program-card-header">
              <label>
                Program name
                <input
                  onChange={(event) =>
                    updateProgram(program.id, (currentProgram) => ({
                      ...currentProgram,
                      name: event.target.value
                    }))
                  }
                  type="text"
                  value={program.name}
                />
              </label>
              <div className="playlist-actions">
                <button disabled={isBusy} onClick={() => void saveProgram(program)} type="button">
                  Save
                </button>
                <button disabled={isBusy} onClick={() => void deleteProgram(program)} type="button">
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
                    <button disabled={isBusy || index === 0} onClick={() => movePlaylist(program.id, index, -1)} type="button">
                      Up
                    </button>
                    <button
                      disabled={isBusy || index === program.playlistIds.length - 1}
                      onClick={() => movePlaylist(program.id, index, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button disabled={isBusy} onClick={() => removePlaylist(program.id, index)} type="button">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <label>
              Add playlist
              <select disabled={isBusy} onChange={(event) => addPlaylist(program.id, event.target.value)} value="">
                <option value="">Choose playlist</option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
