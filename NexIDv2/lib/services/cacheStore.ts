type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export async function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await loader();
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
