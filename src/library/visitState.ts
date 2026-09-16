import type { LibraryVisit } from "./types.js";

export function applyVisitUpsert(existing: LibraryVisit[], next: LibraryVisit): LibraryVisit[] {
  const kept = existing.filter(
    (visit) =>
      !(
        visit.guild_id === next.guild_id &&
        visit.user_id === next.user_id &&
        visit.day_key === next.day_key
      )
  );
  return [...kept, next].sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function applyVisitClear(
  existing: LibraryVisit[],
  filter: { guild_id: string; user_id: string; day_key: string }
): LibraryVisit[] {
  return existing.filter(
    (visit) =>
      !(
        visit.guild_id === filter.guild_id &&
        visit.user_id === filter.user_id &&
        visit.day_key === filter.day_key
      )
  );
}
