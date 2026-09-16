import Avatar from "./Avatar";

type AvatarStackProps = {
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  accentByUser?: Map<string, string>;
  size?: "sm" | "md";
};

export default function AvatarStack({
  userIds,
  avatarByUser,
  accentByUser,
  size = "md",
}: AvatarStackProps) {
  const visible = userIds;
  if (visible.length === 0) return null;
  const showAccentRings = visible.length > 1;

  return (
    <div className="avatarStack">
      {visible.map((userId) => (
        <Avatar
          key={userId}
          userId={userId}
          avatarHash={avatarByUser.get(userId) ?? null}
          size={size}
          accentColor={showAccentRings ? accentByUser?.get(userId) : undefined}
        />
      ))}
    </div>
  );
}
