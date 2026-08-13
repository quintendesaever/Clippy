export const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr", "Za"] as const;
export const DAY_FULL_LABELS = [
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
] as const;

const MONTHS_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

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

export function formatAgendaDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const jsDay = new Date(y, m - 1, d).getDay();
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const dayName = DAY_FULL_LABELS[dayIndex] ?? DAY_LABELS[dayIndex] ?? "";
  return `${dayName} ${d} ${MONTHS_SHORT[m - 1]}`;
}

export function formatWeekRange(startIso: string, endIso: string): string {
  const [, sm, sd] = startIso.split("-").map(Number);
  const [, em, ed] = endIso.split("-").map(Number);
  if (sm === em) return `${sd}–${ed} ${MONTHS_SHORT[sm - 1]}`;
  return `${sd} ${MONTHS_SHORT[sm - 1]} – ${ed} ${MONTHS_SHORT[em - 1]}`;
}
