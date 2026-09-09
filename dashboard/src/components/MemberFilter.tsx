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
};

export default function MemberFilter({ members, selected, onToggle }: MemberFilterProps) {
  if (members.length === 0) return null;

  return (
    <div className="memberFilter">
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
