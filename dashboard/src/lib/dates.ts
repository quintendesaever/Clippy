export const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"] as const;

export function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function eventDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function weekDayDates(weekMonday: Date): string[] {
  return DAY_LABELS.map((_, i) =>
    toISODate(
      new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + i)
    )
  );
}
