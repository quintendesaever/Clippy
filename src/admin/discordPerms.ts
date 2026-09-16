import {
  ChannelType,
  DiscordAPIError,
  MessageFlags,
  RESTJSONErrorCodes,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type NewsChannel,
  type PermissionResolvable,
  type TextChannel,
} from "discord.js";

export type LockableTextChannel = TextChannel | NewsChannel;

export const GUILD_ONLY_REPLY = "This command can only be used in a server.";
export const NOT_TEXT_CHANNEL_REPLY = "This command only works in a server text channel.";
export const MISSING_PERMISSIONS_REPLY = "I'm missing Discord permissions to do that.";

export type PermCheckResult = { ok: true } | { ok: false; message: string };

export function missingUserPermissionMessage(permissionLabel: string): string {
  return `You need **${permissionLabel}** to use this command.`;
}

export function missingBotPermissionMessage(permissionLabel: string): string {
  return `I need **${permissionLabel}** in this channel to do that.`;
}

export function hasRequiredPermissions(
  permissions: { has(permission: PermissionResolvable): boolean } | null | undefined,
  required: readonly PermissionResolvable[],
  mode: "all" | "any" = "all"
): boolean {
  if (!permissions) return false;
  if (mode === "any") return required.some((bit) => permissions.has(bit));
  return required.every((bit) => permissions.has(bit));
}

export function messageForDiscordErrorCode(code: number | string): string | null {
  if (code === RESTJSONErrorCodes.MissingPermissions || code === 50013) {
    return MISSING_PERMISSIONS_REPLY;
  }
  return null;
}

export function formatDiscordApiError(err: unknown): string | null {
  if (!(err instanceof DiscordAPIError)) return null;
  return messageForDiscordErrorCode(err.code);
}

export async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, components: [] });
    return;
  }
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

export function requireGuild(
  interaction: Pick<ChatInputCommandInteraction, "guild" | "guildId">
): { ok: true; guild: Guild; guildId: string } | { ok: false; message: string } {
  if (!interaction.guild || !interaction.guildId) {
    return { ok: false, message: GUILD_ONLY_REPLY };
  }
  return { ok: true, guild: interaction.guild, guildId: interaction.guildId };
}

function isGuildMember(member: unknown): member is GuildMember {
  return Boolean(
    member &&
      typeof member === "object" &&
      "roles" in member &&
      "guild" in member &&
      "user" in member &&
      typeof (member as GuildMember).permissionsIn === "function"
  );
}

export async function resolveGuildMember(
  interaction: ChatInputCommandInteraction
): Promise<GuildMember | null> {
  if (isGuildMember(interaction.member)) return interaction.member;
  if (!interaction.guild) return null;
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

export function isClearableTextChannel(
  channel: ChatInputCommandInteraction["channel"]
): channel is GuildTextBasedChannel {
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;
  if (channel.isVoiceBased()) return false;
  return true;
}

export function isLockableTextChannel(
  channel: ChatInputCommandInteraction["channel"]
): channel is LockableTextChannel {
  if (!channel) return false;
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

export async function resolveInteractionChannel(
  interaction: ChatInputCommandInteraction
): Promise<ChatInputCommandInteraction["channel"]> {
  if (interaction.channel) return interaction.channel;
  if (!interaction.channelId) return null;
  const fetched = await interaction.client.channels.fetch(interaction.channelId).catch(() => null);
  return fetched as ChatInputCommandInteraction["channel"];
}

export async function checkUserChannelPermission(
  interaction: ChatInputCommandInteraction,
  channel: GuildTextBasedChannel,
  required: readonly PermissionResolvable[],
  permissionLabel: string,
  mode: "all" | "any" = "all"
): Promise<PermCheckResult> {
  const member = await resolveGuildMember(interaction);
  const permissions = member ? channel.permissionsFor(member) : interaction.memberPermissions;
  if (!hasRequiredPermissions(permissions, required, mode)) {
    return { ok: false, message: missingUserPermissionMessage(permissionLabel) };
  }
  return { ok: true };
}

export function checkBotChannelPermission(
  channel: GuildTextBasedChannel,
  clientUserId: string | undefined,
  required: readonly PermissionResolvable[],
  permissionLabel: string,
  mode: "all" | "any" = "all"
): PermCheckResult {
  const me =
    channel.guild.members.me ??
    (clientUserId ? channel.guild.members.cache.get(clientUserId) : undefined);
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!hasRequiredPermissions(permissions, required, mode)) {
    return { ok: false, message: missingBotPermissionMessage(permissionLabel) };
  }
  return { ok: true };
}
