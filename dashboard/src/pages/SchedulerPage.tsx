import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { DayOfWeek, Program, SchedulerBlock, SchedulerConfig } from "../programTypes";
import type { Theme } from "../themeTypes";

const refreshIntervalMs = 10_000;
const daysOfWeek: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const dayLabels: Record<DayOfWeek, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};

function createBlock(programId: string): SchedulerBlock {
  return {
    id: `block-${Date.now()}`,
    programId,
    themeId: "default-fullscreen",
    startTime: "08:00",
    endTime: "18:00"
  };
}

export function SchedulerPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerConfig>({
    version: 0,
    updatedAt: "",
    blocks: []
  });
  const [status, setStatus] = useState("Loading scheduler...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const isDirtyRef = useRef(false);
  const selectedBlockIdRef = useRef("");

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  function selectBlock(blockId: string) {
    selectedBlockIdRef.current = blockId;
    setSelectedBlockId(blockId);
  }

  async function loadData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      const programResponse = await fetch(apiUrl("/api/programs")).catch(() => null);

      if (programResponse?.ok) {
        setPrograms((await programResponse.json()) as Program[]);
      }

      return;
    }

    setIsBusy(true);

    try {
      const [programResponse, schedulerResponse, themeResponse] = await Promise.all([
        fetch(apiUrl("/api/programs")),
        fetch(apiUrl("/api/scheduler")),
        fetch(apiUrl("/api/themes"))
      ]);

      if (!programResponse.ok || !schedulerResponse.ok || !themeResponse.ok) {
        throw new Error("scheduler data unavailable");
      }

      const programBody = (await programResponse.json()) as Program[];
      const themeBody = (await themeResponse.json()) as Theme[];
      const schedulerBody = (await schedulerResponse.json()) as SchedulerConfig;
      const selectedBlock =
        schedulerBody.blocks.find((block) => block.id === selectedBlockIdRef.current) ??
        schedulerBody.blocks[0];

      setPrograms(programBody);
      setThemes(themeBody);
      setScheduler(schedulerBody);
      selectBlock(selectedBlock?.id ?? "");
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Scheduler loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load scheduler: ${error.message}` : "Unable to load scheduler.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveScheduler() {
    setIsBusy(true);
    setStatus("Saving scheduler...");

    try {
      const response = await fetch(apiUrl("/api/scheduler"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduler)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as SchedulerConfig;
      setScheduler(body);
      selectBlock(body.blocks.find((block) => block.id === selectedBlockIdRef.current)?.id ?? body.blocks[0]?.id ?? "");
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Scheduler saved.");
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  function addBlock() {
    const programId = programs[0]?.id;

    if (!programId) {
      setStatus("Create a program before adding scheduler blocks.");
      return;
    }

    const block = createBlock(programId);
    setScheduler((currentScheduler) => ({
      ...currentScheduler,
      blocks: [...currentScheduler.blocks, block]
    }));
    selectBlock(block.id);
    markDirty();
  }

  function updateBlock(blockId: string, updater: (block: SchedulerBlock) => SchedulerBlock) {
    setScheduler((currentScheduler) => ({
      ...currentScheduler,
      blocks: currentScheduler.blocks.map((block) => (block.id === blockId ? updater(block) : block))
    }));
    markDirty();
  }

  function updateBlockField(
    blockId: string,
    field: "programId" | "themeId" | "startDate" | "endDate" | "startTime" | "endTime",
    value: string
  ) {
    updateBlock(blockId, (block) => {
      const nextBlock = { ...block };

      if (value) {
        nextBlock[field] = value;
      } else if (field !== "programId") {
        delete nextBlock[field];
      }

      return nextBlock;
    });
  }

  function toggleDay(blockId: string, day: DayOfWeek, isChecked: boolean) {
    updateBlock(blockId, (block) => {
      const selectedDays = new Set(block.daysOfWeek ?? []);

      if (isChecked) {
        selectedDays.add(day);
      } else {
        selectedDays.delete(day);
      }

      const days = daysOfWeek.filter((candidateDay) => selectedDays.has(candidateDay));
      const nextBlock = { ...block };

      if (days.length > 0) {
        nextBlock.daysOfWeek = days;
      } else {
        delete nextBlock.daysOfWeek;
      }

      return nextBlock;
    });
  }

  function removeBlock(blockId: string) {
    setScheduler((currentScheduler) => ({
      ...currentScheduler,
      blocks: currentScheduler.blocks.filter((block) => block.id !== blockId)
    }));
    const remainingBlocks = scheduler.blocks.filter((block) => block.id !== blockId);
    selectBlock(remainingBlocks[0]?.id ?? "");
    markDirty();
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setScheduler((currentScheduler) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentScheduler.blocks.length) {
        return currentScheduler;
      }

      const blocks = [...currentScheduler.blocks];
      const [block] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, block);

      return { ...currentScheduler, blocks };
    });
    markDirty();
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="page-section" id="scheduler">
      <div className="section-header">
        <div>
          <h2>Scheduler</h2>
          <p>Time blocks choose which program becomes the generated player schedule.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={addBlock} type="button">
            Add Block
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
        {scheduler.blocks.length === 0 ? <p>No scheduler blocks. The default playlist remains active.</p> : null}
        {scheduler.blocks.map((block, index) => (
          <article className="program-card" key={block.id}>
            <div className="program-card-header">
              <label>
                Edit block
                <input
                  checked={selectedBlockId === block.id}
                  onChange={() => selectBlock(block.id)}
                  type="radio"
                />
              </label>
              <label>
                Program
                <select
                  onChange={(event) => updateBlockField(block.id, "programId", event.target.value)}
                  value={block.programId}
                >
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Theme
                <select
                  onChange={(event) => updateBlockField(block.id, "themeId", event.target.value)}
                  value={block.themeId ?? "default-fullscreen"}
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="playlist-actions">
                <button disabled={isBusy || index === 0} onClick={() => moveBlock(index, -1)} type="button">
                  Up
                </button>
                <button
                  disabled={isBusy || index === scheduler.blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                  type="button"
                >
                  Down
                </button>
                <button disabled={isBusy} onClick={() => removeBlock(block.id)} type="button">
                  Remove
                </button>
                {selectedBlockId === block.id ? (
                  <button disabled={isBusy} onClick={() => void saveScheduler()} type="button">
                    Save Scheduler
                  </button>
                ) : null}
              </div>
            </div>

            <div className="playlist-schedule-fields">
              <label>
                Date From
                <input
                  onChange={(event) => updateBlockField(block.id, "startDate", event.target.value)}
                  type="date"
                  value={block.startDate ?? ""}
                />
              </label>
              <label>
                Date Until
                <input
                  onChange={(event) => updateBlockField(block.id, "endDate", event.target.value)}
                  type="date"
                  value={block.endDate ?? ""}
                />
              </label>
              <label>
                Time From
                <input
                  onChange={(event) => updateBlockField(block.id, "startTime", event.target.value)}
                  type="time"
                  value={block.startTime ?? ""}
                />
              </label>
              <label>
                Time Until
                <input
                  onChange={(event) => updateBlockField(block.id, "endTime", event.target.value)}
                  type="time"
                  value={block.endTime ?? ""}
                />
              </label>
            </div>

            <fieldset className="playlist-days">
              <legend>Days of week</legend>
              {daysOfWeek.map((day) => (
                <label key={day}>
                  <input
                    checked={block.daysOfWeek?.includes(day) ?? false}
                    onChange={(event) => toggleDay(block.id, day, event.target.checked)}
                    type="checkbox"
                  />
                  {dayLabels[day]}
                </label>
              ))}
            </fieldset>
          </article>
        ))}
      </div>
    </section>
  );
}
