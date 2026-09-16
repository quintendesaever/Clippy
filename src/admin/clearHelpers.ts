export const CLEAR_MIN = 1;
export const CLEAR_MAX = 100;
export const CLEAR_CONFIRM_AT = 50;
export const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export type ClearMessageLike = {
  id: string;
  pinned: boolean;
  createdTimestamp: number;
};

export function isValidClearCount(n: number): boolean {
  return Number.isInteger(n) && n >= CLEAR_MIN && n <= CLEAR_MAX;
}

export function selectClearTargets<T extends ClearMessageLike>(
  messages: Iterable<T>,
  now = Date.now()
): { deletable: T[]; skippedPinned: number; skippedOld: number } {
  let skippedPinned = 0;
  let skippedOld = 0;
  const deletable: T[] = [];
  for (const message of messages) {
    if (message.pinned) {
      skippedPinned += 1;
      continue;
    }
    if (now - message.createdTimestamp >= TWO_WEEKS_MS) {
      skippedOld += 1;
      continue;
    }
    deletable.push(message);
  }
  return { deletable, skippedPinned, skippedOld };
}

export function formatClearResult(
  deleted: number,
  skippedPinned: number,
  skippedOld: number
): string {
  const parts = [`Deleted **${deleted}** message(s).`];
  const skipped = skippedPinned + skippedOld;
  if (skipped > 0) {
    const reasons: string[] = [];
    if (skippedPinned > 0) reasons.push(`${skippedPinned} pinned`);
    if (skippedOld > 0) reasons.push(`${skippedOld} older than 14 days`);
    parts.push(`Skipped ${skipped} (${reasons.join(", ")}).`);
  }
  return parts.join(" ");
}
