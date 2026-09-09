import { useEffect, useState } from "react";
import { payloadHasUnresolvedNames } from "@shared/memberName";
import type { AdminFilterMember } from "../types";

export function statsUserFilterKey(selected: Set<string>, memberIds: string[]): string {
  if (memberIds.length === 0 || selected.size === 0) return "all";
  if (memberIds.every((id) => selected.has(id))) return "all";
  return [...selected].sort().join(",");
}

export function toggleMemberId(prev: Set<string>, userId: string): Set<string> {
  const next = new Set(prev);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  return next;
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function filterMembersHaveUnresolvedNames(members: AdminFilterMember[]): boolean {
  return payloadHasUnresolvedNames(
    members.map((row) => row.displayName),
    members.map((row) => row.userId)
  );
}
