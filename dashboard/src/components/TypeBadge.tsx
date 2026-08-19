import { colorForTypeBadge, labelForTypeBadge } from "@shared/timetable/eventMeta";
import type { CSSProperties } from "react";

type TypeBadgeProps = {
  badges?: string[];
};

export default function TypeBadge({ badges }: TypeBadgeProps) {
  const code = badges?.[0];
  if (!code) return null;
  const label = labelForTypeBadge(code);
  const color = colorForTypeBadge(code);

  return (
    <span
      className="typeBadge"
      style={{ "--type-badge-color": color } as CSSProperties}
      title={label}
    >
      {label}
    </span>
  );
}
