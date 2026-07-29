/**
 * Smoke test for the Teams layer.
 *
 * Verifies that a status written through the Teams path (src/lib/teams/status-write.ts)
 * produces the same rows as the web magic-link route, since the two intentionally have
 * separate implementations. Also exercises the relay so query and dedupe bugs surface.
 *
 * Creates a throwaway status window and removes everything it created.
 * Run: npx tsx prisma/smoke-teams-relay.ts
 */
import "dotenv/config";

// The relay short-circuits without bot credentials, which would leave its queries
// untested. Dummy values make the query paths run; nothing reaches Azure because a fresh
// database has no stored conversations to send to. Real credentials are left alone.
const usingDummyCredentials = !process.env.MICROSOFT_APP_ID || !process.env.MICROSOFT_APP_PASSWORD;
if (usingDummyCredentials) {
  process.env.MICROSOFT_APP_ID = "00000000-0000-0000-0000-000000000000";
  process.env.MICROSOFT_APP_PASSWORD = "smoke-test-secret";
  process.env.MICROSOFT_APP_TYPE = "MultiTenant";
}

import { addHours, startOfDay } from "date-fns";
import { prisma } from "../src/lib/prisma";
import { createStatusToken } from "../src/lib/tokens";
import {
  getStatusContext,
  writeDailyStatusForResource,
} from "../src/lib/teams/status-write";
import { runAllTeamsRelays } from "../src/lib/teams/relay";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`, detail ?? "");
  }
}

async function main() {
  const resource = await prisma.resource.findFirst({
    where: { active: true },
    include: { assignments: { where: { active: true }, include: { project: true } } },
  });
  if (!resource) throw new Error("No active resource found — run npm run db:seed first");

  const companyId = resource.companyId;
  console.log(`Using resource ${resource.name} (company ${companyId})`);

  // A window far in the future would be "not open"; use a window that starts now.
  const now = new Date();
  const windowDate = startOfDay(now);
  const created: { windowId?: string; statusId?: string } = {};
  let restoreConfig: (() => Promise<void>) | null = null;
  let restoreTask: (() => Promise<void>) | null = null;

  const existingWindow = await prisma.statusWindow.findUnique({
    where: { companyId_date: { companyId, date: windowDate } },
  });
  if (existingWindow) {
    throw new Error(
      `A status window already exists for ${windowDate.toDateString()}. Run this against a clean day or delete window ${existingWindow.id}.`,
    );
  }

  const window = await prisma.statusWindow.create({
    data: { companyId, date: windowDate, startsAt: now, expiresAt: addHours(now, 2) },
  });
  created.windowId = window.id;

  const { tokenHash, tokenHint } = createStatusToken();
  const request = await prisma.statusRequest.create({
    data: {
      statusWindowId: window.id,
      resourceId: resource.id,
      tokenHash,
      tokenHint,
      state: "pending",
    },
  });

  try {
    console.log("\nStatus context");
    const context = await getStatusContext(companyId, resource.id);
    check("context resolves for an open window", context.ok, context);
    if (!context.ok) throw new Error("cannot continue without a status context");
    check("context points at the request we created", context.context.requestId === request.id);
    check(
      "context exposes assigned projects",
      context.context.projects.length === resource.assignments.length,
      { got: context.context.projects.length, want: resource.assignments.length },
    );

    const task = context.context.tasks[0];
    const project = context.context.projects[0];

    // The rollup assertions drive a task to 100%/done. Put it back afterwards, otherwise
    // every later run finds no open tasks and quietly skips those checks.
    if (task) {
      const before = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      restoreTask = async () => {
        await prisma.task.update({
          where: { id: task.id },
          data: { progressPct: before.progressPct, status: before.status },
        });
      };
    }

    console.log("\nFirst write");
    const first = await writeDailyStatusForResource({
      companyId,
      resourceId: resource.id,
      data: {
        productiveHours: 6,
        nonProductiveHours: 2,
        narrative: "smoke test narrative",
        blockers: "smoke test blocker",
        progressPct: 55,
        projectId: project?.id,
        items: task ? [{ taskId: task.id, hours: 0, progressPct: 70 }] : [],
      },
    });
    check("write succeeds", first.ok, first);
    if (!first.ok) throw new Error("cannot continue without a written status");
    created.statusId = first.statusId;
    check("first write is not an update", first.isUpdate === false);

    const saved = await prisma.dailyStatus.findUniqueOrThrow({
      where: { id: first.statusId },
      include: { items: true },
    });

    // These are exactly the columns POST /api/status/submit writes.
    check("statusRequestId links back to the request", saved.statusRequestId === request.id);
    check("resourceId matches", saved.resourceId === resource.id);
    check("date comes from the window, not from now", saved.date.getTime() === window.date.getTime());
    check("productiveHours stored", saved.productiveHours === 6);
    check("nonProductiveHours stored", saved.nonProductiveHours === 2);
    check("narrative stored", saved.narrative === "smoke test narrative");
    check("blockers stored", saved.blockers === "smoke test blocker");
    check("progressPct stored", saved.progressPct === 55);
    check("projectId stored", saved.projectId === (project?.id ?? null));

    const refreshedRequest = await prisma.statusRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    check("request marked submitted", refreshedRequest.state === "submitted");
    check("submittedAt set", refreshedRequest.submittedAt !== null);
    check("openedAt backfilled", refreshedRequest.openedAt !== null);

    if (task) {
      check("one item written", saved.items.length === 1, saved.items);
      check("item carries the task id", saved.items[0]?.taskId === task.id);
      const rolledUp = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      check("task progress rolled up", rolledUp.progressPct === 70, rolledUp.progressPct);
      check("task moved to in_progress", rolledUp.status === "in_progress", rolledUp.status);
    } else {
      console.log("  skip  task rollup (resource has no open tasks)");
    }

    console.log("\nSecond write (edit)");
    const second = await writeDailyStatusForResource({
      companyId,
      resourceId: resource.id,
      data: {
        productiveHours: 7,
        nonProductiveHours: 1,
        narrative: "edited narrative",
        progressPct: 80,
        projectId: project?.id,
        items: task ? [{ taskId: task.id, hours: 0, progressPct: 100 }] : [],
      },
    });
    check("edit succeeds", second.ok, second);
    check("edit reported as update", second.ok && second.isUpdate === true);
    check("edit reuses the same DailyStatus row", second.ok && second.statusId === first.statusId);

    const edited = await prisma.dailyStatus.findUniqueOrThrow({
      where: { id: first.statusId },
      include: { items: true },
    });
    check("hours updated", edited.productiveHours === 7 && edited.nonProductiveHours === 1);
    check("blockers cleared when omitted", edited.blockers === null, edited.blockers);
    check(
      "items replaced rather than appended",
      edited.items.length === (task ? 1 : 0),
      edited.items.length,
    );
    if (task) {
      const done = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      check("100% marks the task done", done.status === "done", done.status);
    }

    console.log("\nRelay");
    if (usingDummyCredentials) {
      console.log("  info  using throwaway bot credentials, so no message can leave the process");
    }

    // Every relay job filters on an enabled TeamsConfig, so enable it for the duration.
    const priorConfig = await prisma.teamsConfig.findUnique({ where: { companyId } });
    restoreConfig = async () => {
      if (priorConfig) {
        await prisma.teamsConfig.update({
          where: { companyId },
          data: { enabled: priorConfig.enabled, chaseEnabled: priorConfig.chaseEnabled },
        });
      } else {
        await prisma.teamsConfig.deleteMany({ where: { companyId } });
      }
    };
    await prisma.teamsConfig.upsert({
      where: { companyId },
      create: { companyId, enabled: true, chaseEnabled: true },
      update: { enabled: true, chaseEnabled: true },
    });

    const relay = await runAllTeamsRelays(companyId);
    check("relay runs with an enabled company", true);
    console.log(`  info  ${JSON.stringify(relay)}`);
    check(
      "relay reports a numeric count for every job",
      Object.values(relay).every((job) => typeof job.sent === "number"),
      relay,
    );

    const identitiesWithDm = await prisma.teamsIdentity.count({
      where: { companyId, conversationRef: { not: null }, optedOut: false },
    });
    check(
      "nothing was sent because nobody has a stored conversation",
      identitiesWithDm > 0 || Object.values(relay).every((job) => job.sent === 0),
      { identitiesWithDm, relay },
    );

    const logs = await prisma.teamsMessageLog.count({ where: { companyId } });
    console.log(`  info  ${logs} TeamsMessageLog row(s) for this company`);

    console.log("\nTeams tables");
    check("TeamsConfig queryable", typeof (await prisma.teamsConfig.count()) === "number");
    check("TeamsIdentity queryable", typeof (await prisma.teamsIdentity.count()) === "number");
    check("TeamsChannelLink queryable", typeof (await prisma.teamsChannelLink.count()) === "number");
    check("TeamsInteraction queryable", typeof (await prisma.teamsInteraction.count()) === "number");
  } finally {
    console.log("\nCleaning up");
    if (created.statusId) {
      await prisma.dailyStatusItem.deleteMany({ where: { dailyStatusId: created.statusId } });
      await prisma.dailyStatus.deleteMany({ where: { id: created.statusId } });
    }
    await prisma.statusRequest.deleteMany({ where: { id: request.id } });
    if (created.windowId) {
      await prisma.statusWindow.deleteMany({ where: { id: created.windowId } });
    }
    if (restoreTask) await restoreTask();
    if (restoreConfig) await restoreConfig();
    console.log(
      "  removed the throwaway window, request and status; restored task progress and TeamsConfig",
    );
  }

  if (failures > 0) {
    throw new Error(`${failures} check(s) failed`);
  }
  console.log("\nAll checks passed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
