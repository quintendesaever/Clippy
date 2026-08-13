const TYPE_PREFIX =
  /^(hoorcollege|werkcollege|practicum|lab|les|groepswerk|exercise|lecture|project|seminar|evaluatie)\s+/i;

export function courseKeyFromTitle(title: string): string {
  return title.replace(TYPE_PREFIX, "").toLowerCase().trim() || title.toLowerCase();
}

/** Distinct hues via the golden angle, muted so they tint dark cards without shouting. */
export function colorForCourseIndex(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 42% 58%)`;
}

export function courseColorMap(titles: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const title of titles) {
    const key = courseKeyFromTitle(title);
    if (!map.has(key)) {
      map.set(key, colorForCourseIndex(map.size));
    }
  }
  return map;
}
