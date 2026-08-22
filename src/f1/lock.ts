export type F1GuildLock = <T>(guildId: string, fn: () => Promise<T>) => Promise<T>;

const guildLocks = new Map<string, Promise<unknown>>();

export function withF1GuildLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
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
