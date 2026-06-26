import { discordAvatarUrl, discordUserAvatarUrl } from "../lib/avatars";

type AvatarProps = {
  userId: string;
  avatarHash?: string | null;
  avatar?: string | null;
  size?: "sm" | "md";
  alt?: string;
};

export default function Avatar({
  userId,
  avatarHash,
  avatar,
  size = "sm",
  alt = "",
}: AvatarProps) {
  const hash = avatarHash ?? avatar ?? null;
  const src = discordAvatarUrl(userId, hash);
  const className = size === "md" ? "avatar avatarMd" : "avatar avatarSm";

  return <img className={className} src={src} alt={alt} loading="lazy" />;
}

export function UserAvatar({
  userId,
  avatar,
  size = "sm",
  alt = "",
}: {
  userId: string;
  avatar: string | null;
  size?: "sm" | "md";
  alt?: string;
}) {
  const src = discordUserAvatarUrl(userId, avatar);
  const className = size === "md" ? "avatar avatarMd" : "avatar avatarSm";
  return <img className={className} src={src} alt={alt} loading="lazy" />;
}
