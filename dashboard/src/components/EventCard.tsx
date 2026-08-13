import AvatarStack from "./AvatarStack";

type EventCardProps = {
  title: string;
  timeLabel: string;
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  leftPercent: number;
  widthPercent: number;
  onClick: () => void;
};

export default function EventCard({
  title,
  timeLabel,
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
        left: `calc(${leftPercent}% + var(--timeline-card-gutter) / 2)`,
        width: `calc(${Math.max(widthPercent, 1)}% - var(--timeline-card-gutter))`,
      }}
      onClick={onClick}
      title={`${title} (${timeLabel})`}
    >
      <AvatarStack userIds={userIds} avatarByUser={avatarByUser} size="md" />
      <span className="eventCardText">
        <span className="eventCardTitle">{title}</span>
        <span className="eventCardTime">{timeLabel}</span>
      </span>
    </button>
  );
}
