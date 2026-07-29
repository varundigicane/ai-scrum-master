/**
 * Fires one agent job over HTTP, then exits.
 *
 * Built for Railway's cron model: a cron service runs its start command and must exit,
 * otherwise Railway skips the next scheduled run. That rules out attaching a schedule to
 * the long-running Next.js service, so a second service from this same repo runs this
 * script instead.
 *
 * Dependency-free (Node 18+ global fetch) so it needs no install step and starts fast.
 *
 * Usage:
 *   node scripts/trigger-cron.mjs                          # teams-all -> /api/teams/cron
 *   node scripts/trigger-cron.mjs teams-reminder
 *   node scripts/trigger-cron.mjs run-all-daily /api/cron
 *
 * Env:
 *   APP_URL      base URL of the app (required)
 *   CRON_SECRET  bearer token, must match the app (default dev-cron-secret)
 *   CRON_JOB     job name, when not passed as argv[0]
 *   CRON_PATH    endpoint path, when not passed as argv[1]
 *   CRON_TIMEOUT_MS  abort after this long (default 120000)
 */

const job = process.argv[2] ?? process.env.CRON_JOB ?? "teams-all";
const path = process.argv[3] ?? process.env.CRON_PATH ?? "/api/teams/cron";
const secret = process.env.CRON_SECRET ?? "dev-cron-secret";
const timeoutMs = Number(process.env.CRON_TIMEOUT_MS ?? 120_000);

const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
if (!baseUrl) {
  console.error("APP_URL is required (the public base URL of the app)");
  process.exit(1);
}

const url = new URL(path, baseUrl).toString();

// The weekly and deadline jobs can take a while, but a hung request must not outlive the
// cron interval, or Railway skips every following run.
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ job }),
    signal: controller.signal,
  });

  const body = await res.text();
  const elapsed = Date.now() - startedAt;

  if (!res.ok) {
    // A wrong path returns a full Next.js HTML error page; truncate so cron logs stay readable.
    const detail = body.length > 500 ? `${body.slice(0, 500)}... (truncated)` : body;
    console.error(`${job} failed: HTTP ${res.status} after ${elapsed}ms`);
    console.error(detail);
    process.exit(1);
  }

  console.log(`${job} ok in ${elapsed}ms: ${body}`);
  process.exit(0);
} catch (error) {
  const aborted = error instanceof Error && error.name === "AbortError";
  console.error(aborted ? `${job} aborted after ${timeoutMs}ms` : `${job} errored`, error);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
