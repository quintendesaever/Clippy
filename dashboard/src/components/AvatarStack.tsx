import Avatar from "./Avatar";

type AvatarStackProps = {
  userIds: string[];
  avatarByUser: Map<string, string | null>;
  size?: "sm" | "md";
};

export default function AvatarStack({ userIds, avatarByUser, size = "md" }: AvatarStackProps) {
  const visible = userIds;
  if (visible.length === 0) return null;

  return (
    <div className="avatarStack">
      {visible.map((userId) => (
        <Avatar
          key={userId}
          userId={userId}
          avatarHash={avatarByUser.get(userId) ?? null}
          size={size}
        />
      ))}
    </div>
  );
}
