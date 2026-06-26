import type { TimetableEventDto } from "../types";

export type BusySlot = {
  startMinutes: number;
  endMinutes: number;
  busyCount: number;
};

export type TimeRange = {
  startMinutes: number;
  endMinutes: number;
};

const DEFAULT_HOUR_START = 8;
const DEFAULT_HOUR_END = 17;
const SLOT_MINUTES = 30;

function eventOverlapsSlot(
  ev: TimetableEventDto,
  slotStart: number,
  slotEnd: number
): boolean {
  if (ev.allDay) return false;
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const evStart = start.getHours() * 60 + start.getMinutes();
  const evEnd = end.getHours() * 60 + end.getMinutes();
  return evStart < slotEnd && evEnd > slotStart;
}

export function computeBusySlots(
  events: TimetableEventDto[],
  hourStart = DEFAULT_HOUR_START,
  hourEnd = DEFAULT_HOUR_END,
  slotMinutes = SLOT_MINUTES
): BusySlot[] {
  const rangeStart = hourStart * 60;
  const rangeEnd = hourEnd * 60;
  const slots: BusySlot[] = [];

  for (let start = rangeStart; start < rangeEnd; start += slotMinutes) {
    const end = Math.min(start + slotMinutes, rangeEnd);
    const busyUsers = new Set<string>();
    for (const ev of events) {
      if (eventOverlapsSlot(ev, start, end)) {
        busyUsers.add(ev.userId);
      }
    }
    slots.push({ startMinutes: start, endMinutes: end, busyCount: busyUsers.size });
  }

  return slots;
}

export function findBestWindows(
  slots: BusySlot[],
  maxBusy = 2
): TimeRange[] {
  const windows: TimeRange[] = [];
  let current: TimeRange | null = null;

  for (const slot of slots) {
    if (slot.busyCount <= maxBusy) {
      if (current && current.endMinutes === slot.startMinutes) {
        current.endMinutes = slot.endMinutes;
      } else {
        if (current) windows.push(current);
        current = { startMinutes: slot.startMinutes, endMinutes: slot.endMinutes };
      }
    } else if (current) {
      windows.push(current);
      current = null;
    }
  }

  if (current) windows.push(current);
  return windows;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeRange(range: TimeRange): string {
  return `${formatMinutes(range.startMinutes)}–${formatMinutes(range.endMinutes)}`;
}

export function barColor(busyCount: number): string {
  if (busyCount <= 2) return "var(--avail-green)";
  if (busyCount <= 4) return "var(--avail-olive)";
  if (busyCount <= 6) return "var(--avail-brown)";
  if (busyCount <= 8) return "var(--avail-red-muted)";
  return "var(--avail-red)";
}

export function hourLabels(hourStart: number, hourEnd: number): number[] {
  return Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i);
}

export { DEFAULT_HOUR_START, DEFAULT_HOUR_END, SLOT_MINUTES };
