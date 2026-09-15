import Avatar from "./Avatar";

export type MemberFilterItem = {
  userId: string;
  label: string;
  avatarHash: string | null;
};

type MemberFilterProps = {
  members: MemberFilterItem[];
  selected: Set<string>;
  onToggle: (userId: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
};

export default function MemberFilter({
  members,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: MemberFilterProps) {
  if (members.length === 0) return null;

  return (
    <div className="memberFilter">
      {onSelectAll && onDeselectAll && (
        <div className="memberFilterActions" role="group" aria-label="Ledenselectie">
          <button
            type="button"
            className="memberFilterAction"
            onClick={onSelectAll}
            disabled={selected.size === members.length}
          >
            Alles
          </button>
          <button
            type="button"
            className="memberFilterAction"
            onClick={onDeselectAll}
            disabled={selected.size === 0}
          >
            Geen
          </button>
        </div>
      )}
      {members.map((member) => (
        <button
          key={member.userId}
          type="button"
          className={`memberChip ${selected.has(member.userId) ? "memberChipSelected" : ""}`}
          onClick={() => onToggle(member.userId)}
        >
          <Avatar userId={member.userId} avatarHash={member.avatarHash} alt={member.label} />
          {member.label}
        </button>
      ))}
    </div>
  );
}
