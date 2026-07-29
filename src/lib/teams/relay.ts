import { format, startOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/tokens";
import {
  blockerAlertCard,
  deadlineCard,
  missedStatusCard,
  reminderCard,
  statusChaseCard,
  statusSubmittedCard,
  weeklyDigestCard,
} from "./cards";
import { isTeamsConfigured } from "./config";
import {
  channelTargetsFor,
  identityTargetForResource,
  leadTargets,
  sendTeamsMessage,
  type TeamsTarget,
} from "./notify";
import { getStatusContext } from "./status-write";

/**
 * Outbound Teams notifications.
 *
 * Every job here only READS the state the existing agent (src/lib/agent.ts) already
 * writes, so the email pipeline needs no changes and this layer can be scheduled
 * independently. All sends are deduped through TeamsMessageLog, so re-running is safe.
 */

async function enabledCompanies(companyId?: string) {
  return prisma.teamsConfig.findMany({
    where: { enabled: true, ...(companyId ? { companyId } : {}) },
  });
}

/** Targets for a lead-facing notification: opted-in channels plus lead DMs. */
async function leadAudience(
  companyId: string,
  type: string,
  projectId?: string | null,
): Promise<TeamsTarget[]> {
  const [channels, leads] = await Promise.all([
    channelTargetsFor(companyId, type, projectId),
    leadTargets(companyId),
  ]);
  const byId = new Map<string, TeamsTarget>();
  for (const target of [...channels, ...leads]) byId.set(target.id, target);
  return [...byId.values()];
}

/** DM the daily status card to everyone still pending in an open window. */
export async function teamsChase(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    if (!config.chaseEnabled) continue;

    const requests = await prisma.statusRequest.findMany({
      where: {
        state: "pending",
        statusWindow: { companyId: config.companyId, expiresAt: { gt: new Date() } },
      },
      include: { resource: true },
    });

    for (const request of requests) {
      const target = await identityTargetForResource(config.companyId, request.resourceId);
      if (!target) continue;

      const status = await getStatusContext(config.companyId, request.resourceId);
      if (!status.ok) continue;

      sent += await sendTeamsMessage({
        companyId: config.companyId,
        type: "status_chase",
        dedupeKey: `chase:${request.id}`,
        targets: [target],
        card: statusChaseCard(status.context, appUrl("/dashboard/status")),
        summary: `Status chase for ${request.resource.name}`,
      });
    }
  }

  return { sent };
}

/** Nudge people who are still pending shortly before the window closes. */
export async function teamsReminder(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  const now = new Date();
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    const cutoff = new Date(now.getTime() + config.reminderMinutesBefore * 60_000);

    const requests = await prisma.statusRequest.findMany({
      where: {
        state: "pending",
        statusWindow: {
          companyId: config.companyId,
          expiresAt: { gt: now, lte: cutoff },
        },
      },
      include: { statusWindow: true },
    });

    for (const request of requests) {
      const target = await identityTargetForResource(config.companyId, request.resourceId);
      if (!target) continue;

      const minutesLeft = Math.max(
        1,
        Math.round((request.statusWindow.expiresAt.getTime() - now.getTime()) / 60_000),
      );

      sent += await sendTeamsMessage({
        companyId: config.companyId,
        type: "status_reminder",
        dedupeKey: `reminder:${request.id}`,
        targets: [target],
        card: reminderCard(minutesLeft),
        summary: `Reminder, ${minutesLeft}m left`,
      });
    }
  }

  return { sent };
}

/**
 * Announce one submitted/updated status to leads.
 *
 * The dedupe key includes updatedAt so an edit re-notifies once (matching the email
 * behaviour) while polling never repeats the same state. Called both by the relay and
 * directly by the bot right after a Teams submission.
 */
export async function announceStatus(companyId: string, statusId: string): Promise<number> {
  const status = await prisma.dailyStatus.findUnique({
    where: { id: statusId },
    include: { resource: true, project: true, statusRequest: true },
  });
  if (!status) return 0;

  const stamp = status.updatedAt.toISOString();
  const isUpdate = status.createdAt.getTime() !== status.updatedAt.getTime();
  let sent = 0;

  const submittedTargets = await leadAudience(companyId, "status_submitted", status.projectId);
  sent += await sendTeamsMessage({
    companyId,
    type: "status_submitted",
    dedupeKey: `status:${statusId}:${stamp}`,
    targets: submittedTargets,
    card: statusSubmittedCard({
      resourceName: status.resource.name,
      productiveHours: status.productiveHours,
      nonProductiveHours: status.nonProductiveHours,
      narrative: status.narrative,
      isUpdate,
    }),
    summary: `${status.resource.name} status`,
  });

  if (status.blockers?.trim()) {
    const blockerTargets = await leadAudience(companyId, "status_blocker", status.projectId);
    sent += await sendTeamsMessage({
      companyId,
      type: "status_blocker",
      dedupeKey: `blocker:${statusId}:${stamp}`,
      targets: blockerTargets,
      card: blockerAlertCard({
        resourceName: status.resource.name,
        blockers: status.blockers.trim(),
        projectName: status.project?.name,
        dashboardUrl: appUrl("/dashboard/status"),
      }),
      summary: `Blocker from ${status.resource.name}`,
    });
  }

  return sent;
}

/** A blocker raised outside the status window, straight from the bot. */
export async function announceAdhocBlocker(args: {
  companyId: string;
  resourceName: string;
  blockers: string;
  projectId?: string | null;
  projectName?: string | null;
}): Promise<number> {
  const targets = await leadAudience(args.companyId, "status_blocker", args.projectId);
  return sendTeamsMessage({
    companyId: args.companyId,
    type: "status_blocker",
    dedupeKey: `adhoc_blocker:${Date.now()}`,
    skipDedupe: true,
    targets,
    card: blockerAlertCard({
      resourceName: args.resourceName,
      blockers: args.blockers,
      projectName: args.projectName,
      dashboardUrl: appUrl("/dashboard/status"),
    }),
    summary: `Ad-hoc blocker from ${args.resourceName}`,
  });
}

/** Re-send the status card to everyone still pending in a window, ignoring dedupe. */
export async function nudgePendingInWindow(
  companyId: string,
  windowId: string,
): Promise<{ sent: number }> {
  const requests = await prisma.statusRequest.findMany({
    where: { statusWindowId: windowId, state: "pending" },
  });

  let sent = 0;
  for (const request of requests) {
    const target = await identityTargetForResource(companyId, request.resourceId);
    if (!target) continue;

    const status = await getStatusContext(companyId, request.resourceId);
    if (!status.ok) continue;

    sent += await sendTeamsMessage({
      companyId,
      type: "status_nudge",
      dedupeKey: `nudge:${request.id}:${Date.now()}`,
      skipDedupe: true,
      targets: [target],
      card: statusChaseCard(status.context, appUrl("/dashboard/status")),
      summary: "Manual nudge",
    });
  }

  return { sent };
}

/** Relay recent submissions and blockers that have not been announced yet. */
export async function teamsRelayStatuses(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  const since = subDays(new Date(), 2);
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    const statuses = await prisma.dailyStatus.findMany({
      where: {
        updatedAt: { gte: since },
        resource: { companyId: config.companyId },
      },
      select: { id: true },
    });

    for (const status of statuses) {
      sent += await announceStatus(config.companyId, status.id);
    }
  }

  return { sent };
}

/** Tell leads who missed a closed window. */
export async function teamsMissed(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  const now = new Date();
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    const windows = await prisma.statusWindow.findMany({
      where: {
        companyId: config.companyId,
        expiresAt: { lte: now, gte: subDays(now, 7) },
        requests: { some: { state: "expired" } },
      },
      include: {
        requests: { where: { state: "expired" }, include: { resource: true } },
      },
    });

    for (const window of windows) {
      const missing = window.requests.map((r) => ({
        name: r.resource.name,
        email: r.resource.email,
      }));
      if (missing.length === 0) continue;

      const targets = await leadAudience(config.companyId, "status_missed");
      sent += await sendTeamsMessage({
        companyId: config.companyId,
        type: "status_missed",
        dedupeKey: `missed:${window.id}`,
        targets,
        card: missedStatusCard({
          dateLabel: format(window.date, "yyyy-MM-dd"),
          closedAtLabel: format(window.expiresAt, "PPpp"),
          missing,
          dashboardUrl: appUrl("/dashboard/status"),
        }),
        summary: `${missing.length} missing on ${format(window.date, "yyyy-MM-dd")}`,
      });
    }
  }

  return { sent };
}

function daysUntil(date: Date, now: Date) {
  return Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
}

/** Mirror the deadline sweep to Teams: owner DM plus the project's channels. */
export async function teamsDeadlines(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  const now = new Date();
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    const company = await prisma.company.findUnique({ where: { id: config.companyId } });
    if (!company) continue;

    const warnDays = (company.deadlineWarnDays || "3,1")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((n) => !Number.isNaN(n));

    const tasks = await prisma.task.findMany({
      where: {
        status: { not: "done" },
        project: { account: { companyId: config.companyId }, active: true },
        OR: [{ clientDeadline: { not: null } }, { resourceDeadline: { not: null } }],
      },
      include: { resource: true, project: true },
    });

    for (const task of tasks) {
      const tracks: { track: "client" | "resource"; deadline: Date }[] = [];
      if (task.clientDeadline) tracks.push({ track: "client", deadline: task.clientDeadline });
      if (task.resourceDeadline) tracks.push({ track: "resource", deadline: task.resourceDeadline });

      for (const { track, deadline } of tracks) {
        const d = daysUntil(deadline, now);
        const overdue = d < 0;
        if (!overdue && !warnDays.includes(d)) continue;

        const type = overdue ? "deadline_overdue" : "deadline_approaching";
        const dedupeKey = overdue
          ? `deadline:overdue:${task.id}:${track}:${format(deadline, "yyyy-MM-dd")}`
          : `deadline:approaching:${task.id}:${track}:${d}d`;

        const targets = await leadAudience(config.companyId, type, task.projectId);
        if (task.resourceId) {
          const owner = await identityTargetForResource(config.companyId, task.resourceId);
          if (owner && !targets.some((t) => t.id === owner.id)) targets.push(owner);
        }

        sent += await sendTeamsMessage({
          companyId: config.companyId,
          type,
          dedupeKey,
          targets,
          card: deadlineCard({
            title: overdue
              ? `Overdue (${track}): ${task.title}`
              : `Due in ${d} day(s) (${track}): ${task.title}`,
            taskLabel: task.displayId ? `${task.displayId} · ${task.title}` : task.title,
            projectName: task.project.name,
            track,
            deadlineLabel: format(deadline, "yyyy-MM-dd"),
            ownerName: task.resource?.name ?? "Unassigned",
            progressPct: task.progressPct,
          }),
          summary: `${type} ${task.displayId ?? task.id}`,
        });
      }
    }
  }

  return { sent };
}

/** Push weekly report packs that the existing job generated. */
export async function teamsWeekly(companyId?: string): Promise<{ sent: number }> {
  if (!isTeamsConfigured()) return { sent: 0 };
  let sent = 0;

  for (const config of await enabledCompanies(companyId)) {
    const reports = await prisma.weeklyReport.findMany({
      where: { companyId: config.companyId, generatedAt: { gte: subDays(new Date(), 8) } },
      orderBy: { generatedAt: "desc" },
    });

    for (const report of reports) {
      const type = `weekly_${report.scope}`;
      let metrics: Record<string, unknown> = {};
      try {
        metrics = JSON.parse(report.metricsJson) as Record<string, unknown>;
      } catch {
        metrics = {};
      }

      let targets: TeamsTarget[] = [];
      let title = "Weekly report";

      if (report.scope === "resource") {
        const own = await identityTargetForResource(config.companyId, report.scopeId);
        const resource = await prisma.resource.findUnique({ where: { id: report.scopeId } });
        title = `Weekly status — ${resource?.name ?? "resource"}`;
        targets = own ? [own] : [];
      } else if (report.scope === "project") {
        const project = await prisma.project.findUnique({ where: { id: report.scopeId } });
        title = `Weekly project status — ${project?.name ?? "project"}`;
        targets = await channelTargetsFor(config.companyId, type, report.scopeId);
      } else {
        title = "Weekly management digest";
        targets = await channelTargetsFor(config.companyId, type);
      }

      if (targets.length === 0) continue;

      sent += await sendTeamsMessage({
        companyId: config.companyId,
        type,
        dedupeKey: `weekly:${report.id}`,
        targets,
        card: weeklyDigestCard({
          title,
          narrative: report.narrative ?? "",
          metrics,
          reportsUrl: appUrl("/dashboard/reports"),
        }),
        summary: title,
      });
    }
  }

  return { sent };
}

export async function runAllTeamsRelays(companyId?: string) {
  return {
    chase: await teamsChase(companyId),
    reminder: await teamsReminder(companyId),
    statuses: await teamsRelayStatuses(companyId),
    missed: await teamsMissed(companyId),
    deadlines: await teamsDeadlines(companyId),
    weekly: await teamsWeekly(companyId),
  };
}
