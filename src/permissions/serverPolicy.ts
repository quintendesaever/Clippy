import type { RoleKind, RoleSnapshot } from "./types.js";

/**
 * Conservative, Clippy-server-specific policy. Role IDs may change except the
 * documented Pin Messages expectation, which is kept here so it can be updated
 * in one place.
 */
export const CLIPPY_SERVER_POLICY = {
  /** Normalized staff role names. Exact current role IDs may change. */
  staffRoleNames: ["owner", "admin", "mod", "assistant"] as const,
  /** Temporary staff roles, e.g. `Admin (Quinten)`. */
  staffRolePrefix: "admin (",
  /**
   * Roles that must keep Pin Messages.
   * `1292583494551080980` is the existing legacy Indie role on this guild.
   */
  pinExpectedRoleIds: ["1292583494551080980"] as const,
  mutedRoleName: "muted",
} as const;

export type ServerPolicy = typeof CLIPPY_SERVER_POLICY;

export function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isStaffRoleName(name: string, policy: ServerPolicy = CLIPPY_SERVER_POLICY): boolean {
  const normalized = normalizeRoleName(name);
  if ((policy.staffRoleNames as readonly string[]).includes(normalized)) return true;
  return normalized.startsWith(policy.staffRolePrefix);
}

export function isMutedRoleName(name: string, policy: ServerPolicy = CLIPPY_SERVER_POLICY): boolean {
  return normalizeRoleName(name) === policy.mutedRoleName;
}

export function isDecorativeRoleName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return !/\p{L}|\p{N}/u.test(trimmed);
}

export function isEveryoneRole(role: Pick<RoleSnapshot, "id">, guildId: string): boolean {
  return role.id === guildId;
}

export function classifyRole(
  role: RoleSnapshot,
  guildId: string,
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): RoleKind {
  if (isEveryoneRole(role, guildId)) return "everyone";
  if (role.managed) return "managed";
  if (isDecorativeRoleName(role.name)) return "decorative";
  if (isStaffRoleName(role.name, policy)) return "staff";
  return "human";
}

export function roleKindLabel(kind: RoleKind): string {
  switch (kind) {
    case "everyone":
      return "@everyone";
    case "staff":
      return "staff";
    case "managed":
      return "managed integration/bot";
    case "decorative":
      return "decorative";
    default:
      return "human (unmanaged, non-staff)";
  }
}

export function isHumanNonStaffRole(
  role: RoleSnapshot,
  guildId: string,
  policy: ServerPolicy = CLIPPY_SERVER_POLICY
): boolean {
  return classifyRole(role, guildId, policy) === "human";
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Course categories typically share a name with the course role that is allowed
 * View Channel. Used only to suppress blanket View Channel undo warnings.
 */
export function namesSuggestCourseAccess(roleName: string, channelName: string, categoryName: string | null): boolean {
  const role = normalizeForMatch(roleName);
  if (role.length < 3) return false;
  const channel = normalizeForMatch(channelName);
  const category = categoryName ? normalizeForMatch(categoryName) : "";
  if (role === channel || (category && role === category)) return true;
  if (category.length >= 3 && (category.includes(role) || role.includes(category))) return true;
  if (channel.length >= 3 && (channel.includes(role) || role.includes(channel))) return true;
  return false;
}
