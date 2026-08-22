import { labelForTypeBadge } from "@shared/timetable/eventMeta";

type TitledEvent = {
  title: string;
  typeBadges?: string[];
  source?: string;
};

function capitalize(label: string): string {
  if (!label) return label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Prefix ICS titles with their type on the web calendar only (Discord uses type pills). */
export function webCalendarTitle(event: TitledEvent, showTypePrefix = false): string {
  if (!showTypePrefix) return event.title;
  if (event.source === "activity") return event.title;
  const badge = event.typeBadges?.find((code) => code.toUpperCase() !== "A");
  if (!badge) return event.title;
  const prefix = capitalize(labelForTypeBadge(badge));
  const lowerTitle = event.title.toLowerCase();
  const lowerPrefix = prefix.toLowerCase();
  if (
    lowerTitle === lowerPrefix ||
    lowerTitle.startsWith(`${lowerPrefix} `) ||
    lowerTitle.startsWith(`${lowerPrefix}:`)
  ) {
    return event.title;
  }
  return `${prefix} ${event.title}`;
}
