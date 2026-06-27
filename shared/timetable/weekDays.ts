export function withoutEmptySaturday<T>(
  days: readonly T[],
  hasActivity: (day: T) => boolean
): T[] {
  if (days.length < 6) return [...days];
  return hasActivity(days[5]) ? [...days] : days.slice(0, 5);
}
