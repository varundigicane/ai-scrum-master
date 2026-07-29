/**
 * Per-identity throttle for bot commands.
 *
 * In-memory on purpose: this guards against one chatty user (or a retry storm from the
 * Bot Framework) hammering the database or the LLM, not against a distributed attacker.
 * A single Railway instance is the deployment target; if that changes, move the counters
 * to Postgres or Redis.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const globalForLimit = globalThis as unknown as {
  teamsRateLimit?: Map<string, number[]>;
};

function store(): Map<string, number[]> {
  if (!globalForLimit.teamsRateLimit) {
    globalForLimit.teamsRateLimit = new Map();
  }
  return globalForLimit.teamsRateLimit;
}

/** True when the caller is allowed to proceed. */
export function allowTeamsCommand(key: string, now = Date.now()): boolean {
  const counters = store();
  const recent = (counters.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    counters.set(key, recent);
    return false;
  }

  recent.push(now);
  counters.set(key, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (counters.size > 500) {
    for (const [existingKey, times] of counters) {
      if (times.every((at) => now - at >= WINDOW_MS)) counters.delete(existingKey);
    }
  }

  return true;
}
