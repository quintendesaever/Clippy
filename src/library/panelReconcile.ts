import type { LibraryMessagePayload } from "./view.js";

const guildLocks = new Map<string, Promise<unknown>>();

export function withGuildLibraryLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
  const previous = guildLocks.get(guildId) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  guildLocks.set(
    guildId,
    current.then(
      () => undefined,
      () => undefined
    )
  );
  return current;
}

export type LibraryPanelRecord = {
  channelId: string;
  messageId: string;
};

export type LibraryReconcileDiscord = {
  fetchMessage(channelId: string, messageId: string): Promise<boolean>;
  editMessage(channelId: string, messageId: string, payload: LibraryMessagePayload): Promise<"ok" | "missing">;
  sendMessage(channelId: string, payload: LibraryMessagePayload): Promise<LibraryPanelRecord>;
  pinMessage(channelId: string, messageId: string): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
};

export type LibraryReconcileResult =
  | { action: "updated"; panel: LibraryPanelRecord }
  | { action: "created"; panel: LibraryPanelRecord }
  | { action: "recreated"; panel: LibraryPanelRecord };

export async function reconcileLibraryPanelState(input: {
  stored: LibraryPanelRecord | null;
  targetChannelId: string;
  payload: LibraryMessagePayload;
  discord: LibraryReconcileDiscord;
}): Promise<LibraryReconcileResult> {
  const stored = input.stored;
  const sameChannel = stored?.channelId === input.targetChannelId;

  if (stored && sameChannel) {
    const exists = await input.discord.fetchMessage(stored.channelId, stored.messageId);
    if (exists) {
      const edited = await input.discord.editMessage(stored.channelId, stored.messageId, input.payload);
      if (edited === "ok") {
        return { action: "updated", panel: stored };
      }
    }
  }

  const sent = await input.discord.sendMessage(input.targetChannelId, input.payload);
  await input.discord.pinMessage(sent.channelId, sent.messageId);

  if (stored && (stored.channelId !== sent.channelId || stored.messageId !== sent.messageId)) {
    await input.discord.deleteMessage(stored.channelId, stored.messageId).catch(() => undefined);
  }

  return {
    action: stored ? "recreated" : "created",
    panel: sent,
  };
}
