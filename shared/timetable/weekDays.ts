/**
 * Hide trailing empty weekend days (Sunday, then Saturday) while keeping
 * calendar order. A Sunday event still shows Saturday even if Saturday is empty.
 */
export function withoutEmptyWeekendDays<T>(
  days: readonly T[],
  hasActivity: (day: T) => boolean
): T[] {
  if (days.length < 6) return [...days];
  const result = [...days];
  if (result.length >= 7 && !hasActivity(result[6]!)) {
    result.pop();
  }
  if (result.length === 6 && !hasActivity(result[5]!)) {
    result.pop();
  }
  return result;
}
