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

export type FetchMessageResult = "ok" | "missing" | "error";

export type LibraryReconcileDiscord = {
  fetchMessage(channelId: string, messageId: string): Promise<FetchMessageResult>;
  editMessage(channelId: string, messageId: string, payload: LibraryMessagePayload): Promise<"ok" | "missing">;
  sendMessage(channelId: string, payload: LibraryMessagePayload): Promise<LibraryPanelRecord>;
  pinMessage(channelId: string, messageId: string): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<"ok" | "missing">;
};

export type LibraryReconcileResult =
  | { action: "updated"; panel: LibraryPanelRecord }
  | { action: "created"; panel: LibraryPanelRecord }
  | { action: "recreated"; panel: LibraryPanelRecord };

export function storedPanelFromSettings(settings: {
  message_id: string | null;
  message_channel_id: string | null;
}): LibraryPanelRecord | null {
  if (!settings.message_id || !settings.message_channel_id) return null;
  return { channelId: settings.message_channel_id, messageId: settings.message_id };
}

export async function reconcileLibraryPanelState(input: {
  stored: LibraryPanelRecord | null;
  targetChannelId: string;
  payload: LibraryMessagePayload;
  retirePayload: LibraryMessagePayload;
  discord: LibraryReconcileDiscord;
}): Promise<LibraryReconcileResult> {
  const stored = input.stored;
  const sameChannel = stored?.channelId === input.targetChannelId;

  if (stored && sameChannel) {
    const fetched = await input.discord.fetchMessage(stored.channelId, stored.messageId);
    if (fetched === "error") {
      throw new Error("library: schedule message fetch failed");
    }
    if (fetched === "ok") {
      const edited = await input.discord.editMessage(stored.channelId, stored.messageId, input.payload);
      if (edited === "ok") {
        return { action: "updated", panel: stored };
      }
    }
  }

  const sent = await input.discord.sendMessage(input.targetChannelId, input.payload);
  await input.discord.pinMessage(sent.channelId, sent.messageId);

  if (stored && (stored.channelId !== sent.channelId || stored.messageId !== sent.messageId)) {
    await retirePreviousPanel(stored, input.retirePayload, input.discord);
  }

  return {
    action: stored ? "recreated" : "created",
    panel: sent,
  };
}

async function retirePreviousPanel(
  stored: LibraryPanelRecord,
  retirePayload: LibraryMessagePayload,
  discord: LibraryReconcileDiscord
): Promise<void> {
  try {
    await discord.editMessage(stored.channelId, stored.messageId, retirePayload);
  } catch {
    // Buttons may still be present; deletion below is the primary cleanup.
  }
  try {
    await discord.deleteMessage(stored.channelId, stored.messageId);
  } catch {
    // New panel is already live; frozen/disabled old message is retried next tick
    // only if message_channel_id still pointed here, which it will not after persist.
    // Best-effort: leave the edited/disabled message rather than failing the move.
  }
}

export type RetirePanelResult = "absent" | "cleared" | "frozen";

export async function retireLibraryPanelState(input: {
  stored: LibraryPanelRecord | null;
  payload: LibraryMessagePayload;
  discord: Pick<LibraryReconcileDiscord, "editMessage" | "deleteMessage">;
}): Promise<RetirePanelResult> {
  if (!input.stored) return "absent";

  try {
    await input.discord.editMessage(input.stored.channelId, input.stored.messageId, input.payload);
  } catch {
    // Strip buttons if possible; deletion is authoritative.
  }

  try {
    await input.discord.deleteMessage(input.stored.channelId, input.stored.messageId);
    return "cleared";
  } catch {
    return "frozen";
  }
}
