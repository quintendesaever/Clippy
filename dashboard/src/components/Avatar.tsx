import type { CSSProperties } from "react";
import { discordAvatarUrl, discordUserAvatarUrl } from "../lib/avatars";

type AvatarProps = {
  userId: string;
  avatarHash?: string | null;
  avatar?: string | null;
  size?: "sm" | "md";
  alt?: string;
  accentColor?: string;
};

export default function Avatar({
  userId,
  avatarHash,
  avatar,
  size = "sm",
  alt = "",
  accentColor,
}: AvatarProps) {
  const hash = avatarHash ?? avatar ?? null;
  const src = discordAvatarUrl(userId, hash);
  const className = `${size === "md" ? "avatar avatarMd" : "avatar avatarSm"}${
    accentColor ? " avatarAccentRing" : ""
  }`;
  const style = accentColor
    ? ({ "--avatar-accent": accentColor } as CSSProperties)
    : undefined;

  return <img className={className} style={style} src={src} alt={alt} loading="lazy" />;
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
