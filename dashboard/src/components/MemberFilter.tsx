import type { CalendarMember } from "../types";
import Avatar from "./Avatar";

type MemberFilterProps = {
  calendars: CalendarMember[];
  selected: Set<string>;
  onToggle: (userId: string) => void;
};

export default function MemberFilter({ calendars, selected, onToggle }: MemberFilterProps) {
  if (calendars.length === 0) return null;

  return (
    <div className="memberFilter">
      {calendars.map((c) => (
        <button
          key={c.user_id}
          type="button"
          className={`memberChip ${selected.has(c.user_id) ? "memberChipSelected" : ""}`}
          onClick={() => onToggle(c.user_id)}
        >
          <Avatar userId={c.user_id} avatarHash={c.avatar_hash} alt={c.initials} />
          {c.initials}
        </button>
      ))}
    </div>
  );
}
