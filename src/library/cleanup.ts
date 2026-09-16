import { PermissionFlagsBits } from "discord.js";

export const LIBRARY_BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const LIBRARY_CLEANUP_BATCH = 100;

export const LIBRARY_SEND_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

export const LIBRARY_MANAGE_MESSAGES = [PermissionFlagsBits.ManageMessages] as const;

export type CleanupMessageLike = {
  id: string;
  pinned: boolean;
  createdTimestamp: number;
};

export type CleanupSelection = {
  deleteIds: string[];
  skippedOld: number;
  preserved: number;
};

export function selectLibraryCleanupDeletes(input: {
  messages: Iterable<CleanupMessageLike>;
  scheduleMessageId: string | null;
  now?: number;
}): CleanupSelection {
  const now = input.now ?? Date.now();
  const deleteIds: string[] = [];
  let skippedOld = 0;
  let preserved = 0;

  for (const message of input.messages) {
    if (input.scheduleMessageId && message.id === input.scheduleMessageId) {
      preserved += 1;
      continue;
    }
    if (message.pinned) {
      preserved += 1;
      continue;
    }
    if (now - message.createdTimestamp >= LIBRARY_BULK_DELETE_MAX_AGE_MS) {
      skippedOld += 1;
      continue;
    }
    deleteIds.push(message.id);
  }

  return { deleteIds, skippedOld, preserved };
}

export type CleanupDiscord = {
  hasManageMessages(): boolean;
  fetchBatch(before?: string): Promise<CleanupMessageLike[]>;
  bulkDelete(ids: string[]): Promise<number>;
};

export async function cleanupLibraryChannel(input: {
  discord: CleanupDiscord;
  scheduleMessageId: string | null;
  now?: number;
}): Promise<{ deleted: number; skippedOld: number; skipped: boolean }> {
  if (!input.discord.hasManageMessages()) {
    return { deleted: 0, skippedOld: 0, skipped: true };
  }

  let before: string | undefined;
  let deleted = 0;
  let skippedOld = 0;

  while (true) {
    const batch = await input.discord.fetchBatch(before);
    if (batch.length === 0) break;

    const oldest = batch.reduce((current, message) =>
      message.createdTimestamp < current.createdTimestamp ? message : current
    );
    const selection = selectLibraryCleanupDeletes({
      messages: batch,
      scheduleMessageId: input.scheduleMessageId,
      now: input.now,
    });
    skippedOld += selection.skippedOld;
    if (selection.deleteIds.length > 0) {
      deleted += await input.discord.bulkDelete(selection.deleteIds);
    }
    if (batch.length < LIBRARY_CLEANUP_BATCH) break;
    before = oldest.id;
  }

  return { deleted, skippedOld, skipped: false };
}
