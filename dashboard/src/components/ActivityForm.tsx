import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { useEffect, useState } from "react";
import { addCalendarDays, dayKeyInTimezone, formatTimeInTimezone } from "@shared/timetable/dates";
import { createActivity, updateActivity } from "../api";
import Button from "./Button";
import type { TimetableEventDto } from "../types";

export type ActivityFormPrefill = {
  dayKey?: string;
  startTime?: string;
  endTime?: string;
};

type ActivityFormProps = {
  mode: "create" | "edit";
  timezone: string;
  initial?: TimetableEventDto | null;
  prefill?: ActivityFormPrefill | null;
  onClose: () => void;
  onSaved: () => void;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function roundToHalfHour(date: Date): { hour: number; minute: number } {
  const total = date.getHours() * 60 + date.getMinutes();
  const rounded = Math.round(total / 30) * 30;
  const clamped = Math.min(Math.max(rounded, 8 * 60), 21 * 60);
  return { hour: Math.floor(clamped / 60), minute: clamped % 60 };
}

function defaultTimes(timezone: string): { dayKey: string; startTime: string; endTime: string } {
  const nowZoned = toZonedTime(new Date(), timezone);
  const { hour, minute } = roundToHalfHour(nowZoned);
  const endTotal = Math.min(hour * 60 + minute + 60, 22 * 60);
  return {
    dayKey: dayKeyInTimezone(new Date(), timezone),
    startTime: `${pad2(hour)}:${pad2(minute)}`,
    endTime: `${pad2(Math.floor(endTotal / 60))}:${pad2(endTotal % 60)}`,
  };
}

function fromEvent(
  event: TimetableEventDto,
  timezone: string
): {
  title: string;
  dayKey: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
} {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startDay = dayKeyInTimezone(start, timezone);
  const endDay = dayKeyInTimezone(end, timezone);
  const endTime = formatTimeInTimezone(end, timezone);
  return {
    title: event.title,
    dayKey: startDay,
    startTime: formatTimeInTimezone(start, timezone),
    endTime: endTime === "00:00" && endDay !== startDay ? "00:00" : endTime,
    location: event.location ?? "",
    description: event.description ?? "",
  };
}

function zonedDateTimeToIso(dayKey: string, time: string, timezone: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return fromZonedTime(new Date(y, m - 1, d, hh, mm, 0, 0), timezone).toISOString();
}

function activityEndIso(dayKey: string, endTime: string, timezone: string): string {
  if (endTime === "00:00") {
    return zonedDateTimeToIso(addCalendarDays(dayKey, 1), "00:00", timezone);
  }
  return zonedDateTimeToIso(dayKey, endTime, timezone);
}

export default function ActivityForm({
  mode,
  timezone,
  initial,
  prefill,
  onClose,
  onSaved,
}: ActivityFormProps) {
  const defaults = defaultTimes(timezone);
  const seeded = initial
    ? fromEvent(initial, timezone)
    : {
        title: "",
        dayKey: prefill?.dayKey ?? defaults.dayKey,
        startTime: prefill?.startTime ?? defaults.startTime,
        endTime: prefill?.endTime ?? defaults.endTime,
        location: "",
        description: "",
      };

  const [title, setTitle] = useState(seeded.title);
  const [dayKey, setDayKey] = useState(seeded.dayKey);
  const [startTime, setStartTime] = useState(seeded.startTime);
  const [endTime, setEndTime] = useState(seeded.endTime);
  const [location, setLocation] = useState(seeded.location);
  const [description, setDescription] = useState(seeded.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        start: zonedDateTimeToIso(dayKey, startTime, timezone),
        end: activityEndIso(dayKey, endTime, timezone),
        location: location.trim() || null,
        description: description.trim() || null,
      };
      if (mode === "edit" && initial?.id) {
        await updateActivity(initial.id, payload);
      } else {
        await createActivity(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="eventPopupOverlay" onClick={onClose}>
      <div className="eventPopup activityFormPopup" onClick={(e) => e.stopPropagation()}>
        <div className="eventPopupHeader">
          <h3 className="eventPopupTitle">
            {mode === "edit" ? "Activiteit bewerken" : "Activiteit toevoegen"}
          </h3>
          <button
            type="button"
            className="eventPopupClose"
            onClick={onClose}
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label className="formLabel">
            Titel
            <input
              className="formInput"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
              placeholder="bv. Kotavond"
              autoFocus
            />
          </label>

          <label className="formLabel">
            Datum
            <input
              className="formInput"
              type="date"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              required
            />
          </label>

          <div className="formRow">
            <label className="formLabel">
              Start
              <input
                className="formInput"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="formLabel">
              Einde
              <input
                className="formInput"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="formLabel">
            Locatie <span className="formOptional">(optioneel)</span>
            <input
              className="formInput"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
              placeholder="bv. Kot"
            />
          </label>

          <label className="formLabel">
            Opmerkingen <span className="formOptional">(optioneel)</span>
            <textarea
              className="formInput formTextarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </label>

          {error && <p className="errorMsg">{error}</p>}

          <div className="formActions">
            <Button type="submit" disabled={saving}>
              {saving ? "Opslaan…" : "Opslaan"}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Annuleren
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
