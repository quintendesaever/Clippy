import AvatarStack from "./AvatarStack";
import TypeBadge from "./TypeBadge";

type EventCardProps = {
  title: string;
  timeLabel: string;
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  leftPercent: number;
  widthPercent: number;
  onClick: () => void;
  isActivity?: boolean;
  typeBadges?: string[];
};

export default function EventCard({
  title,
  timeLabel,
  userIds,
  avatarByUser,
  leftPercent,
  widthPercent,
  onClick,
  isActivity = false,
  typeBadges,
}: EventCardProps) {
  return (
    <button
      type="button"
      className={`eventCard${isActivity ? " eventCardActivity" : ""}`}
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 0)}%`,
      }}
      onClick={onClick}
      title={`${title} (${timeLabel})`}
    >
      <AvatarStack userIds={userIds} avatarByUser={avatarByUser} size="md" />
      <TypeBadge badges={typeBadges} />
      <span className="eventCardText">
        <span className="eventCardTitle">{title}</span>
        <span className="eventCardTime">{timeLabel}</span>
      </span>
    </button>
  );
}
