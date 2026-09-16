export type FindingSeverity = "fail" | "warn" | "ok";

export type OverwriteTargetType = "role" | "member";

export type ChannelKind = "text" | "announcement" | "category";

export type RoleKind = "everyone" | "staff" | "managed" | "decorative" | "human";

export type OverwriteSnapshot = {
  id: string;
  type: OverwriteTargetType;
  allow: bigint;
  deny: bigint;
};

export type RoleSnapshot = {
  id: string;
  name: string;
  position: number;
  permissions: bigint;
  managed: boolean;
  mentionable: boolean;
  /** Whether Clippy could edit this role. Null when the bot member is unknown. */
  editable: boolean | null;
  /** Discord role color integer; omitted in older snapshots/tests. */
  color?: number;
};

export type ChannelSnapshot = {
  id: string;
  name: string;
  kind: ChannelKind;
  parentId: string | null;
  /** discord.js permissionsLocked; null when there is no parent or it is unknown. */
  permissionsLocked: boolean | null;
  overwrites: OverwriteSnapshot[];
};

export type BotSnapshot = {
  memberId: string | null;
  highestRolePosition: number | null;
  highestRoleName?: string | null;
  resolved: boolean;
};

export type GuildSnapshot = {
  id: string;
  name: string;
  roles: RoleSnapshot[];
  channels: ChannelSnapshot[];
  bot: BotSnapshot;
  rolesFetchIncomplete: boolean;
  channelsFetchIncomplete: boolean;
};

export type Finding = {
  severity: FindingSeverity;
  code: string;
  title: string;
  detail: string;
  target?: string;
};

export type AuditResult = {
  findings: Finding[];
};

export type RoleInspection = {
  role: RoleSnapshot;
  kind: RoleKind;
  explicitPermissions: { bit: bigint; granted: boolean }[];
  highRiskGranted: bigint[];
  pinMessages: boolean;
  pinExpected: boolean;
  manageable: boolean | null;
  channelOverrides: ChannelOverrideSummary[];
  omittedOverrides: number;
  notes: string[];
};

export type ChannelOverrideSummary = {
  channelId: string;
  channelName: string;
  allow: bigint;
  deny: bigint;
};

export type ChannelInspection = {
  channel: ChannelSnapshot;
  parentName: string | null;
  overwrites: ResolvedOverwrite[];
  botEffective: { bit: bigint; allowed: boolean }[] | null;
  botCanView: boolean | null;
  notes: string[];
};

export type OverwriteSource = "base" | "category" | "inherited" | "explicit";

export type ResolvedOverwrite = {
  id: string;
  type: OverwriteTargetType;
  name: string;
  allow: bigint;
  deny: bigint;
  everyone: boolean;
  member: boolean;
  source?: OverwriteSource;
};

export type UserInspection = {
  userId: string;
  displayName: string;
  channelId: string;
  channelName: string;
  roles: { id: string; name: string }[];
  effective: { bit: bigint; allowed: boolean }[];
  administrator: boolean;
  owner: boolean;
  timedOut: boolean;
  timeoutUntil: string | null;
  computed: boolean;
  notes: string[];
};
