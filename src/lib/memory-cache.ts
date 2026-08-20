type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const MAX = 500;

/** Process-local TTL cache (Railway single instance). */
export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs = 45_000) {
  if (store.size >= MAX) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string) {
  store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function companyCacheKey(companyId: string, resource: string, params = "") {
  return `${companyId}:${resource}:${params}`;
}
