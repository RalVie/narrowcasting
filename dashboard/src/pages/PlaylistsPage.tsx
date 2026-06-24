import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../api/apiBase";
import type { MediaItem } from "../mediaTypes";
import type { DayOfWeek, Playlist, PlaylistItem } from "../playlistTypes";

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
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function createPlaylistItem(media: MediaItem): PlaylistItem {
  return {
    id: `item-${Date.now()}-${media.id}`,
    mediaId: media.id,
    type: media.type,
    file: media.filename,
    duration: 10
  };
}

function formatDateSummary(value: string) {
  const [year, month, day] = value.split("-");
  const monthIndex = Number(month) - 1;
  const monthLabel = monthLabels[monthIndex] ?? month;
  return `${day} ${monthLabel} ${year}`;
}

function summarizeDays(days?: DayOfWeek[]) {
  if (!days || days.length === 0) {
    return null;
  }

  if (
    days.length === 5 &&
    daysOfWeek.slice(0, 5).every((day) => days.includes(day))
  ) {
    return "Mon-Fri";
  }

  if (days.length === 7) {
    return "Every day";
  }

  return days.map((day) => dayLabels[day]).join(", ");
}

function summarizeSchedule(item: PlaylistItem) {
  const parts: string[] = [];
  const daySummary = summarizeDays(item.daysOfWeek);

  if (daySummary) {
    parts.push(daySummary);
  }

  if (item.startTime || item.endTime) {
    parts.push(`${item.startTime || "00:00"}-${item.endTime || "23:59"}`);
  }

  if (item.startDate || item.endDate) {
    const startDate = item.startDate ? formatDateSummary(item.startDate) : "From now";
    const endDate = item.endDate ? formatDateSummary(item.endDate) : "No end date";
    parts.push(`${startDate} - ${endDate}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "Always active";
}

function withScheduleField(
  item: PlaylistItem,
  field: "startDate" | "endDate" | "startTime" | "endTime",
  value: string
) {
  const nextItem = { ...item };

  if (value) {
    nextItem[field] = value;
  } else {
    delete nextItem[field];
  }

  return nextItem;
}

export function PlaylistsPage() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [playlist, setPlaylist] = useState<Playlist>({
    version: 0,
    updatedAt: "",
    items: []
  });
  const [status, setStatus] = useState("Loading playlist...");
  const [isBusy, setIsBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);

  function markDirty() {
    isDirtyRef.current = true;
    setIsDirty(true);
  }

  async function loadEditorData(options: { force?: boolean } = {}) {
    if (isDirtyRef.current && !options.force) {
      return;
    }

    setIsBusy(true);

    try {
      const [mediaResponse, playlistResponse] = await Promise.all([
        fetch(apiUrl("/api/media")),
        fetch(apiUrl("/api/playlist"))
      ]);

      if (!mediaResponse.ok) {
        throw new Error(`media HTTP ${mediaResponse.status}`);
      }

      if (!playlistResponse.ok) {
        throw new Error(`playlist HTTP ${playlistResponse.status}`);
      }

      const mediaBody = (await mediaResponse.json()) as MediaItem[];
      const playlistBody = (await playlistResponse.json()) as Playlist;

      setMediaItems(mediaBody);
      setPlaylist(playlistBody);
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus("Playlist loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to load playlist: ${error.message}` : "Unable to load playlist.");
    } finally {
      setIsBusy(false);
    }
  }

  function addMediaItem(media: MediaItem) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: [...currentPlaylist.items, createPlaylistItem(media)]
    }));
    markDirty();
  }

  function removeItem(id: string) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.filter((item) => item.id !== id)
    }));
    markDirty();
  }

  function moveItem(index: number, direction: -1 | 1) {
    setPlaylist((currentPlaylist) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentPlaylist.items.length) {
        return currentPlaylist;
      }

      const items = [...currentPlaylist.items];
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);

      return {
        ...currentPlaylist,
        items
      };
    });
    markDirty();
  }

  function updateDuration(id: string, duration: number) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) =>
        item.id === id ? { ...item, duration: Math.max(duration, 1) } : item
      )
    }));
    markDirty();
  }

  function updateScheduleField(
    id: string,
    field: "startDate" | "endDate" | "startTime" | "endTime",
    value: string
  ) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) =>
        item.id === id ? withScheduleField(item, field, value) : item
      )
    }));
    markDirty();
  }

  function toggleDayOfWeek(id: string, day: DayOfWeek, isChecked: boolean) {
    setPlaylist((currentPlaylist) => ({
      ...currentPlaylist,
      items: currentPlaylist.items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const selectedDays = new Set(item.daysOfWeek ?? []);

        if (isChecked) {
          selectedDays.add(day);
        } else {
          selectedDays.delete(day);
        }

        const orderedDays = daysOfWeek.filter((candidateDay) => selectedDays.has(candidateDay));
        const nextItem = { ...item };

        if (orderedDays.length > 0) {
          nextItem.daysOfWeek = orderedDays;
        } else {
          delete nextItem.daysOfWeek;
        }

        return nextItem;
      })
    }));
    markDirty();
  }

  async function savePlaylist() {
    setIsBusy(true);
    setStatus("Saving playlist...");

    try {
      const response = await fetch(apiUrl("/api/playlist"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(playlist)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as Playlist;
      setPlaylist(body);
      isDirtyRef.current = false;
      setIsDirty(false);
      setStatus(`Playlist saved as version ${body.version}.`);
      window.dispatchEvent(new CustomEvent("narrowcasting:playlist-saved"));
      await loadEditorData({ force: true });
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadEditorData();
    const timer = window.setInterval(() => {
      void loadEditorData();
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="page-section" id="playlists">
      <div className="section-header">
        <div>
          <h2>Playlists</h2>
          <p>Single local playlist used to generate the player schedule.</p>
        </div>
        <div className="button-row">
          <button disabled={isBusy} onClick={() => void loadEditorData({ force: true })} type="button">
            Refresh
          </button>
          <button disabled={isBusy} onClick={() => void savePlaylist()} type="button">
            Save
          </button>
        </div>
      </div>

      <p className="status-text">
        {status}
        {isDirty ? " Unsaved changes." : ""}
      </p>

      <div className="playlist-editor">
        <section className="playlist-panel" aria-label="Media available for playlist">
          <h3>Media</h3>
          <div className="playlist-media-list">
            {mediaItems.map((media) => (
              <article className="playlist-media-row" key={media.id}>
                <div>
                  <strong>{media.filename}</strong>
                  <span>{media.type}</span>
                </div>
                <button disabled={isBusy} onClick={() => addMediaItem(media)} type="button">
                  Add
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="playlist-panel" aria-label="Current playlist">
          <div className="playlist-panel-header">
            <h3>Playlist</h3>
            <span>Version {playlist.version}</span>
          </div>

          <div className="playlist-items">
            {playlist.items.length === 0 ? <p>No playlist items yet.</p> : null}

            {playlist.items.map((item, index) => (
              <article className="playlist-item-row" key={item.id}>
                <div className="playlist-item-topline">
                  <div className="playlist-item-main">
                    <strong>{item.file}</strong>
                    <span>
                      {item.type} | {summarizeSchedule(item)}
                    </span>
                  </div>
                  <label>
                    Duration
                    <input
                      min="1"
                      onChange={(event) => updateDuration(item.id, Number(event.target.value))}
                      type="number"
                      value={item.duration}
                    />
                  </label>
                  <div className="playlist-actions">
                    <button disabled={isBusy || index === 0} onClick={() => moveItem(index, -1)} type="button">
                      Up
                    </button>
                    <button
                      disabled={isBusy || index === playlist.items.length - 1}
                      onClick={() => moveItem(index, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button disabled={isBusy} onClick={() => removeItem(item.id)} type="button">
                      Remove
                    </button>
                  </div>
                </div>

                <div className="playlist-schedule-fields">
                  <label>
                    Date From
                    <input
                      onChange={(event) => updateScheduleField(item.id, "startDate", event.target.value)}
                      type="date"
                      value={item.startDate ?? ""}
                    />
                  </label>
                  <label>
                    Date Until
                    <input
                      onChange={(event) => updateScheduleField(item.id, "endDate", event.target.value)}
                      type="date"
                      value={item.endDate ?? ""}
                    />
                  </label>
                  <label>
                    Time From
                    <input
                      onChange={(event) => updateScheduleField(item.id, "startTime", event.target.value)}
                      type="time"
                      value={item.startTime ?? ""}
                    />
                  </label>
                  <label>
                    Time Until
                    <input
                      onChange={(event) => updateScheduleField(item.id, "endTime", event.target.value)}
                      type="time"
                      value={item.endTime ?? ""}
                    />
                  </label>
                </div>

                <fieldset className="playlist-days">
                  <legend>Days of week</legend>
                  {daysOfWeek.map((day) => (
                    <label key={day}>
                      <input
                        checked={item.daysOfWeek?.includes(day) ?? false}
                        onChange={(event) => toggleDayOfWeek(item.id, day, event.target.checked)}
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
      </div>
    </section>
  );
}
