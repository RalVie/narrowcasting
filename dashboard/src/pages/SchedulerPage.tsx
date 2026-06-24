import { useEffect, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { DayOfWeek, Program, SchedulerBlock, SchedulerConfig } from "../programTypes";

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
    startTime: "08:00",
    endTime: "18:00"
  };
}

export function SchedulerPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerConfig>({
    version: 0,
    updatedAt: "",
    blocks: []
  });
  const [status, setStatus] = useState("Loading scheduler...");
  const [isBusy, setIsBusy] = useState(false);

  async function loadData() {
    setIsBusy(true);

    try {
      const [programResponse, schedulerResponse] = await Promise.all([
        fetch(apiUrl("/api/programs")),
        fetch(apiUrl("/api/scheduler"))
      ]);

      if (!programResponse.ok || !schedulerResponse.ok) {
        throw new Error("scheduler data unavailable");
      }

      setPrograms((await programResponse.json()) as Program[]);
      setScheduler((await schedulerResponse.json()) as SchedulerConfig);
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

      setScheduler((await response.json()) as SchedulerConfig);
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

    setScheduler((currentScheduler) => ({
      ...currentScheduler,
      blocks: [...currentScheduler.blocks, createBlock(programId)]
    }));
  }

  function updateBlock(blockId: string, updater: (block: SchedulerBlock) => SchedulerBlock) {
    setScheduler((currentScheduler) => ({
      ...currentScheduler,
      blocks: currentScheduler.blocks.map((block) => (block.id === blockId ? updater(block) : block))
    }));
  }

  function updateBlockField(
    blockId: string,
    field: "programId" | "startDate" | "endDate" | "startTime" | "endTime",
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
          <button disabled={isBusy} onClick={() => void saveScheduler()} type="button">
            Save
          </button>
          <button disabled={isBusy} onClick={() => void loadData()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <p className="status-text">{status}</p>

      <div className="program-list">
        {scheduler.blocks.length === 0 ? <p>No scheduler blocks. The default playlist remains active.</p> : null}
        {scheduler.blocks.map((block, index) => (
          <article className="program-card" key={block.id}>
            <div className="program-card-header">
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
