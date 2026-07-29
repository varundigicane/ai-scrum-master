/**
 * Smoke test for the Bot Framework adapter shim.
 *
 * CloudAdapter.process expects Express/Restify style req/res objects, but Next.js App
 * Router hands us a web Request. src/lib/teams/adapter.ts shims both sides, and this
 * asserts the shim actually round-trips: a well-formed but unsigned activity must come
 * back as 401 from the adapter's own JWT validation rather than crashing.
 *
 * Uses throwaway credentials, talks to no network, touches no database.
 * Run: npx tsx prisma/smoke-teams-adapter.ts
 */
process.env.MICROSOFT_APP_ID = process.env.MICROSOFT_APP_ID || "00000000-0000-0000-0000-000000000000";
process.env.MICROSOFT_APP_PASSWORD = process.env.MICROSOFT_APP_PASSWORD || "smoke-test-secret";
process.env.MICROSOFT_APP_TYPE = "MultiTenant";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? "");
  }
}

function activityRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/teams/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function main() {
  // Imported after the credentials above are in place, since the adapter reads them on load.
  const { processTeamsActivity } = await import("../src/lib/teams/adapter");

  let logicRan = false;

  console.log("Unsigned activity");
  const unsigned = await processTeamsActivity(
    activityRequest({
      type: "message",
      text: "hello",
      id: "1",
      channelId: "msteams",
      serviceUrl: "https://smba.trafficmanager.net/test/",
      from: { id: "user-1", aadObjectId: "aad-1" },
      recipient: { id: "bot-1" },
      conversation: { id: "conv-1", conversationType: "personal" },
    }),
    async () => {
      logicRan = true;
    },
  );

  check("adapter returns a status instead of throwing", typeof unsigned.status === "number", unsigned);
  check("unsigned activity is rejected with 401", unsigned.status === 401, unsigned);
  check("bot logic never ran for an unauthenticated activity", logicRan === false);

  console.log("\nMalformed body");
  const badJson = await processTeamsActivity(
    new Request("https://example.test/api/teams/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }),
    async () => {
      logicRan = true;
    },
  );
  check("invalid JSON is rejected with 400", badJson.status === 400, badJson);

  console.log("\nMissing activity type");
  const noType = await processTeamsActivity(activityRequest({ text: "hello" }), async () => {
    logicRan = true;
  });
  check("activity without a type is rejected with 400", noType.status === 400, noType);
  check("bot logic still never ran", logicRan === false);

  if (failures > 0) {
    throw new Error(`${failures} check(s) failed`);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
