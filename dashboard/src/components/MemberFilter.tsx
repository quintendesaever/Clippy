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
  const allSelected = selected.size === members.length;
  const noneSelected = selected.size === 0;

  return (
    <div className="memberFilter">
      {onSelectAll && onDeselectAll && (
        <div className="memberFilterActions" role="group" aria-label="Ledenselectie">
          <button
            type="button"
            className={`memberFilterAction${allSelected ? " memberFilterActionSelected" : ""}`}
            onClick={onSelectAll}
            aria-pressed={allSelected}
          >
            Alles
          </button>
          <button
            type="button"
            className={`memberFilterAction${noneSelected ? " memberFilterActionSelected" : ""}`}
            onClick={onDeselectAll}
            aria-pressed={noneSelected}
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
          aria-pressed={selected.has(member.userId)}
        >
          <Avatar userId={member.userId} avatarHash={member.avatarHash} alt={member.label} />
          {member.label}
        </button>
      ))}
    </div>
  );
}
