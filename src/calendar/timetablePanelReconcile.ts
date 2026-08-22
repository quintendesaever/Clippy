export type PanelRecord = {
  guildId: string;
  channelId: string;
  messageId: string;
  weekKey: string;
};

export type ReconcileDiscord = {
  fetchMessage(channelId: string, messageId: string): Promise<boolean>;
  editMessage(channelId: string, messageId: string): Promise<"ok" | "missing">;
  sendMessage(channelId: string): Promise<{ channelId: string; messageId: string }>;
  pinMessage(channelId: string, messageId: string): Promise<void>;
};

export type ReconcileResult =
  | { action: "created" }
  | { action: "updated"; panel: PanelRecord }
  | { action: "recreated"; panel: PanelRecord };

export async function reconcileTimetablePanel(input: {
  guildId: string;
  invokeChannelId: string;
  stored: PanelRecord | null;
  weekKey: string;
  discord: ReconcileDiscord;
}): Promise<ReconcileResult> {
  if (!input.stored) {
    return { action: "created" };
  }

  const exists = await input.discord.fetchMessage(input.stored.channelId, input.stored.messageId);
  if (exists) {
    const edited = await input.discord.editMessage(input.stored.channelId, input.stored.messageId);
    if (edited === "ok") {
      return {
        action: "updated",
        panel: { ...input.stored, weekKey: input.weekKey },
      };
    }
  }

  const sent = await input.discord.sendMessage(input.invokeChannelId);
  await input.discord.pinMessage(sent.channelId, sent.messageId);
  return {
    action: "recreated",
    panel: {
      guildId: input.guildId,
      channelId: sent.channelId,
      messageId: sent.messageId,
      weekKey: input.weekKey,
    },
  };
}
