import AvatarStack from "./AvatarStack";

type EventCardProps = {
  title: string;
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  leftPercent: number;
  widthPercent: number;
  onClick: () => void;
};

export default function EventCard({
  title,
  userIds,
  avatarByUser,
  leftPercent,
  widthPercent,
  onClick,
}: EventCardProps) {
  return (
    <button
      type="button"
      className="eventCard"
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 1)}%`,
      }}
      onClick={onClick}
      title={title}
    >
      <AvatarStack userIds={userIds} avatarByUser={avatarByUser} size="md" />
      <span className="eventCardTitle">{title}</span>
    </button>
  );
}
