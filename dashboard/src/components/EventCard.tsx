import AvatarStack from "./AvatarStack";
import { memberAccentStyle } from "../hooks/useMemberColors";

type EventCardProps = {
  title: string;
  timeLabel: string;
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  colorByUser?: Map<string, string>;
  showMemberColors?: boolean;
  leftPercent: number;
  widthPercent: number;
  onClick: () => void;
  isActivity?: boolean;
};

export default function EventCard({
  title,
  timeLabel,
  userIds,
  avatarByUser,
  colorByUser,
  showMemberColors = false,
  leftPercent,
  widthPercent,
  onClick,
  isActivity = false,
}: EventCardProps) {
  const colors =
    showMemberColors && colorByUser
      ? userIds.map((id) => colorByUser.get(id)).filter((c): c is string => Boolean(c))
      : [];
  const accent = showMemberColors ? memberAccentStyle(colors) : undefined;

  return (
    <button
      type="button"
      className={`eventCard${isActivity ? " eventCardActivity" : ""}${
        accent ? " eventCardMemberColors" : ""
      }`}
      style={{
        left: `${leftPercent}%`,
        width: `${Math.max(widthPercent, 0)}%`,
        ...(accent ?? {}),
      }}
      onClick={onClick}
      title={`${title} (${timeLabel})`}
    >
      <AvatarStack
        userIds={userIds}
        avatarByUser={avatarByUser}
        accentByUser={showMemberColors ? colorByUser : undefined}
        size="md"
      />
      <span className="eventCardText">
        <span className="eventCardTitle">{title}</span>
        <span className="eventCardTime">{timeLabel}</span>
      </span>
    </button>
  );
}
