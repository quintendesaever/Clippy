export type MemberLabel = { displayName: string; username: string };

export const UNKNOWN_MEMBER_NAME = "Onbekend";

export function looksLikeSnowflake(value: string | null | undefined): boolean {
  return Boolean(value && /^\d{17,20}$/.test(value));
}

export function resolveMemberDisplayName(options: {
  userId: string;
  displayName?: string | null;
  username?: string | null;
  initials?: string | null;
}): string {
  const fromLabel = options.displayName?.trim();
  if (fromLabel && !looksLikeSnowflake(fromLabel)) return fromLabel;
  const initials = options.initials?.trim();
  if (initials) return initials;
  const username = options.username?.trim();
  if (username && !looksLikeSnowflake(username)) return username;
  return UNKNOWN_MEMBER_NAME;
}

export function payloadHasUnresolvedNames(
  names: Array<string | null | undefined>,
  userIds: Array<string | null | undefined> = []
): boolean {
  return names.some((name, i) => {
    if (looksLikeSnowflake(name)) return true;
    const userId = userIds[i];
    return Boolean(name && userId && name === userId && looksLikeSnowflake(userId));
  });
}
