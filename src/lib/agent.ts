import { addDays, addHours, endOfDay, format, startOfDay, startOfWeek, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appUrl, createStatusToken } from "@/lib/tokens";
import type { Company, Task } from "@/generated/prisma/client";

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function windowBounds(company: Company, now = new Date()) {
  const { h, m } = parseHm(company.statusWindowStart);
  const startsAt = new Date(now);
  startsAt.setHours(h, m, 0, 0);
  const expiresAt = addHours(startsAt, company.statusWindowHours || 2);
  const date = startOfDay(startsAt);
  return { date, startsAt, expiresAt };
}

export async function openDailyStatusWindow(companyId?: string) {
  const companies = companyId
    ? [await prisma.company.findUniqueOrThrow({ where: { id: companyId } })]
    : await prisma.company.findMany();

  const results = [];

  for (const company of companies) {
    const { date, startsAt, expiresAt } = windowBounds(company);
    const window = await prisma.statusWindow.upsert({
      where: { companyId_date: { companyId: company.id, date } },
      create: { companyId: company.id, date, startsAt, expiresAt },
      update: {},
    });

    const resources = await prisma.resource.findMany({
      where: { companyId: company.id, active: true },
      include: {
        leaves: {
          where: {
            status: "approved",
            startDate: { lte: endOfDay(date) },
            endDate: { gte: startOfDay(date) },
          },
        },
        assignments: { where: { active: true }, include: { project: true } },
      },
    });

    let sent = 0;
    for (const resource of resources) {
      const onLeave = resource.leaves.length > 0;
      const { token, tokenHash, tokenHint } = createStatusToken();

      const existing = await prisma.statusRequest.findUnique({
        where: {
          statusWindowId_resourceId: {
            statusWindowId: window.id,
            resourceId: resource.id,
          },
        },
      });
      if (existing) continue;

      const request = await prisma.statusRequest.create({
        data: {
          statusWindowId: window.id,
          resourceId: resource.id,
          tokenHash,
          tokenHint,
          state: onLeave ? "skipped_leave" : "pending",
          emailSentAt: onLeave ? null : new Date(),
        },
      });

      if (onLeave) continue;

      const link = appUrl(`/status/${token}`);
      await sendEmail({
        companyId: company.id,
        type: "status_chase",
        dedupeKey: `status_chase:${request.id}`,
        to: [resource.email],
        subject: `Daily status due — submit by ${format(expiresAt, "HH:mm")}`,
        html: `
          <p>Hi ${resource.name},</p>
          <p>Please submit your daily status. This link expires at <strong>${format(expiresAt, "PPpp")}</strong> (2 hours from window start).</p>
          <p><a href="${link}">Submit daily status</a></p>
          <p>Projects: ${resource.assignments.map((a) => a.project.name).join(", ") || "—"}</p>
        `,
        entityType: "StatusRequest",
        entityId: request.id,
      });
      sent += 1;
    }

    results.push({ companyId: company.id, windowId: window.id, sent });
  }

  return results;
}

export async function closeExpiredStatusWindows(companyId?: string) {
  const now = new Date();
  const windows = await prisma.statusWindow.findMany({
    where: {
      expiresAt: { lte: now },
      ...(companyId ? { companyId } : {}),
      requests: { some: { state: "pending" } },
    },
    include: {
      company: true,
      requests: {
        where: { state: "pending" },
        include: { resource: true },
      },
    },
  });

  for (const window of windows) {
    await prisma.statusRequest.updateMany({
      where: { statusWindowId: window.id, state: "pending" },
      data: { state: "expired" },
    });

    const missing = window.requests.map((r) => r.resource);
    if (missing.length === 0) continue;

    const leads = await prisma.user.findMany({
      where: {
        companyId: window.companyId,
        active: true,
        role: { in: ["ProjectManager", "AVP", "VP"] },
      },
    });

    await sendEmail({
      companyId: window.companyId,
      type: "status_missed",
      dedupeKey: `status_missed:${window.id}`,
      to: leads.map((u) => u.email),
      subject: `Missing daily status — ${format(window.date, "yyyy-MM-dd")} (${missing.length})`,
      html: `
        <p>The status window closed at ${format(window.expiresAt, "PPpp")}.</p>
        <p>Missing submissions:</p>
        <ul>${missing.map((r) => `<li>${r.name} (${r.email})</li>`).join("")}</ul>
      `,
      entityType: "StatusWindow",
      entityId: window.id,
    });
  }

  return { closed: windows.length };
}

export async function notifyStatusChange(opts: {
  companyId: string;
  resourceName: string;
  resourceId: string;
  statusId: string;
  isUpdate: boolean;
  productiveHours: number;
  nonProductiveHours: number;
  blockers?: string | null;
  narrative?: string | null;
}) {
  const leads = await prisma.user.findMany({
    where: {
      companyId: opts.companyId,
      active: true,
      role: { in: ["ProjectManager", "AVP", "VP"] },
    },
  });

  const verb = opts.isUpdate ? "updated" : "submitted";
  await sendEmail({
    companyId: opts.companyId,
    type: opts.isUpdate ? "status_updated" : "status_submitted",
    dedupeKey: `status_change:${opts.statusId}:${opts.isUpdate ? "upd" : "new"}:${Date.now()}`,
    skipDedupe: true,
    to: leads.map((u) => u.email),
    subject: `Status ${verb}: ${opts.resourceName}`,
    html: `
      <p><strong>${opts.resourceName}</strong> ${verb} daily status.</p>
      <p>Productive: ${opts.productiveHours}h · Non-productive: ${opts.nonProductiveHours}h</p>
      ${opts.blockers ? `<p><strong>Blockers:</strong> ${opts.blockers}</p>` : ""}
      ${opts.narrative ? `<p>${opts.narrative}</p>` : ""}
      <p><a href="${appUrl("/dashboard/status")}">View status dashboard</a></p>
    `,
    entityType: "DailyStatus",
    entityId: opts.statusId,
  });

  if (opts.blockers?.trim()) {
    await sendEmail({
      companyId: opts.companyId,
      type: "status_blocker",
      dedupeKey: `status_blocker:${opts.statusId}`,
      to: leads.map((u) => u.email),
      subject: `Blocker flagged: ${opts.resourceName}`,
      html: `<p>${opts.resourceName} reported blockers:</p><p>${opts.blockers}</p>`,
      entityType: "DailyStatus",
      entityId: opts.statusId,
    });
  }
}

function daysUntil(date: Date, now: Date) {
  return Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
}

async function recipientsForTask(task: Task & { resource: { email: string; name: string } | null }, companyId: string) {
  const emails: string[] = [];
  if (task.resource?.email) emails.push(task.resource.email);
  const staff = await prisma.user.findMany({
    where: {
      companyId,
      active: true,
      role: { in: ["ProjectManager", "AVP", "VP"] },
    },
  });
  emails.push(...staff.map((s) => s.email));
  return emails;
}

export async function sweepDeadlines(companyId?: string) {
  const now = new Date();
  const companies = companyId
    ? [await prisma.company.findUniqueOrThrow({ where: { id: companyId } })]
    : await prisma.company.findMany();

  let sent = 0;

  for (const company of companies) {
    const warnDays = (company.deadlineWarnDays || "3,1")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((n) => !Number.isNaN(n));

    const tasks = await prisma.task.findMany({
      where: {
        status: { not: "done" },
        project: { account: { companyId: company.id }, active: true },
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
        const emails = await recipientsForTask(task, company.id);

        if (d < 0) {
          const ok = await sendEmail({
            companyId: company.id,
            type: "deadline_overdue",
            dedupeKey: `deadline:overdue:${task.id}:${track}:${format(deadline, "yyyy-MM-dd")}`,
            to: emails,
            subject: `OVERDUE (${track}): ${task.title}`,
            html: `
              <p>Task <strong>${task.title}</strong> on project <strong>${task.project.name}</strong> is overdue.</p>
              <p>${track} deadline was ${format(deadline, "yyyy-MM-dd")} (${Math.abs(d)} day(s) ago).</p>
              <p>Owner: ${task.resource?.name ?? "Unassigned"}</p>
            `,
            entityType: "Task",
            entityId: task.id,
          });
          if (ok) sent += 1;
        } else if (warnDays.includes(d)) {
          const ok = await sendEmail({
            companyId: company.id,
            type: "deadline_approaching",
            dedupeKey: `deadline:approaching:${task.id}:${track}:${d}d`,
            to: emails,
            subject: `Due in ${d} day(s) (${track}): ${task.title}`,
            html: `
              <p>Task <strong>${task.title}</strong> on <strong>${task.project.name}</strong> is due in ${d} day(s).</p>
              <p>${track} deadline: ${format(deadline, "yyyy-MM-dd")}</p>
              <p>Owner: ${task.resource?.name ?? "Unassigned"} · Progress: ${task.progressPct}%</p>
            `,
            entityType: "Task",
            entityId: task.id,
          });
          if (ok) sent += 1;
        }
      }
    }
  }

  return { sent };
}

function narrativeFromMetrics(title: string, metrics: Record<string, unknown>): string {
  return `${title}: submitted ${metrics.submitted ?? 0}/${metrics.expected ?? 0}, productive hours ${metrics.productiveHours ?? 0}, overdue tasks ${metrics.overdueTasks ?? 0}, open defects ${metrics.openDefects ?? 0}.`;
}

export async function generateWeeklyReports(companyId?: string) {
  const companies = companyId
    ? [await prisma.company.findUniqueOrThrow({ where: { id: companyId } })]
    : await prisma.company.findMany();

  const periodEnd = startOfDay(new Date());
  const periodStart = startOfWeek(subDays(periodEnd, 1), { weekStartsOn: 1 });
  const created = [];

  for (const company of companies) {
    const staff = await prisma.user.findMany({
      where: {
        companyId: company.id,
        active: true,
        role: { in: ["ProjectManager", "AVP", "VP", "SVP", "CEO", "CompanyAdmin"] },
      },
    });

    const resources = await prisma.resource.findMany({
      where: { companyId: company.id, active: true },
    });

    for (const resource of resources) {
      const statuses = await prisma.dailyStatus.findMany({
        where: {
          resourceId: resource.id,
          date: { gte: periodStart, lt: addDays(periodEnd, 1) },
        },
      });
      const requests = await prisma.statusRequest.findMany({
        where: {
          resourceId: resource.id,
          statusWindow: { date: { gte: periodStart, lt: addDays(periodEnd, 1) } },
        },
      });
      const tasks = await prisma.task.findMany({
        where: {
          resourceId: resource.id,
          status: { not: "done" },
          OR: [
            { clientDeadline: { lt: periodEnd } },
            { resourceDeadline: { lt: periodEnd } },
          ],
        },
      });

      const metrics = {
        submitted: requests.filter((r) => r.state === "submitted").length,
        expected: requests.filter((r) => r.state !== "skipped_leave").length,
        missed: requests.filter((r) => r.state === "expired").length,
        productiveHours: statuses.reduce((s, x) => s + x.productiveHours, 0),
        nonProductiveHours: statuses.reduce((s, x) => s + x.nonProductiveHours, 0),
        overdueTasks: tasks.length,
        openDefects: 0,
      };
      const narrative = narrativeFromMetrics(`Weekly — ${resource.name}`, metrics);
      const report = await prisma.weeklyReport.create({
        data: {
          companyId: company.id,
          scope: "resource",
          scopeId: resource.id,
          periodStart,
          periodEnd,
          metricsJson: JSON.stringify(metrics),
          narrative,
          emailedTo: [
            resource.email,
            ...staff.filter((s) => s.role === "ProjectManager").map((s) => s.email),
          ].join(","),
        },
      });

      await sendEmail({
        companyId: company.id,
        type: "weekly_resource",
        dedupeKey: `weekly:resource:${resource.id}:${format(periodStart, "yyyy-MM-dd")}`,
        to: [resource.email, ...staff.filter((s) => s.role === "ProjectManager").map((s) => s.email)],
        subject: `Weekly status — ${resource.name} (${format(periodStart, "MMM d")}–${format(subDays(periodEnd, 0), "MMM d")})`,
        html: `<p>${narrative}</p><pre>${JSON.stringify(metrics, null, 2)}</pre>`,
        entityType: "WeeklyReport",
        entityId: report.id,
      });
      created.push(report.id);
    }

    const projects = await prisma.project.findMany({
      where: { active: true, account: { companyId: company.id } },
      include: {
        account: true,
        tasks: true,
        defects: true,
        testCases: true,
        assignments: true,
      },
    });

    for (const project of projects) {
      const statuses = await prisma.dailyStatus.findMany({
        where: {
          projectId: project.id,
          date: { gte: periodStart, lt: addDays(periodEnd, 1) },
        },
      });
      const closedReqs = await prisma.requirement.count({
        where: { projectId: project.id, closed: true },
      });
      const defectCount = project.defects.length;
      const metrics = {
        productiveHours: statuses.reduce((s, x) => s + x.productiveHours, 0),
        overdueTasks: project.tasks.filter(
          (t) =>
            t.status !== "done" &&
            ((t.clientDeadline && t.clientDeadline < periodEnd) ||
              (t.resourceDeadline && t.resourceDeadline < periodEnd)),
        ).length,
        openDefects: project.defects.filter((d) => d.status !== "closed").length,
        testPassRate:
          project.testCases.length === 0
            ? null
            : project.testCases.filter((t) => t.status === "pass").length / project.testCases.length,
        defectDensity: closedReqs === 0 ? defectCount : defectCount / closedReqs,
        resources: project.assignments.length,
        rag:
          project.tasks.some((t) => t.status !== "done" && t.clientDeadline && t.clientDeadline < periodEnd)
            ? "Red"
            : project.defects.some((d) => d.severity === "critical" && d.status !== "closed")
              ? "Amber"
              : "Green",
      };
      const narrative = narrativeFromMetrics(`Project ${project.name}`, metrics);
      const report = await prisma.weeklyReport.create({
        data: {
          companyId: company.id,
          scope: "project",
          scopeId: project.id,
          periodStart,
          periodEnd,
          metricsJson: JSON.stringify(metrics),
          narrative,
          emailedTo: staff.map((s) => s.email).join(","),
        },
      });

      await sendEmail({
        companyId: company.id,
        type: "weekly_project",
        dedupeKey: `weekly:project:${project.id}:${format(periodStart, "yyyy-MM-dd")}`,
        to: staff.map((s) => s.email),
        subject: `Weekly project status — ${project.account.name} / ${project.name} [${metrics.rag}]`,
        html: `<p>${narrative}</p><pre>${JSON.stringify(metrics, null, 2)}</pre>`,
        entityType: "WeeklyReport",
        entityId: report.id,
      });
      created.push(report.id);
    }

    const digestMetrics = {
      projects: projects.length,
      red: 0,
      amber: 0,
      green: 0,
    };
    // recount from reports just created is heavy; simple pass:
    for (const p of projects) {
      const overdue = p.tasks.some(
        (t) => t.status !== "done" && t.clientDeadline && t.clientDeadline < periodEnd,
      );
      if (overdue) digestMetrics.red += 1;
      else if (p.defects.some((d) => d.severity === "critical" && d.status !== "closed"))
        digestMetrics.amber += 1;
      else digestMetrics.green += 1;
    }

    const digest = await prisma.weeklyReport.create({
      data: {
        companyId: company.id,
        scope: "company",
        scopeId: company.id,
        periodStart,
        periodEnd,
        metricsJson: JSON.stringify(digestMetrics),
        narrative: `Company digest: ${digestMetrics.green} Green, ${digestMetrics.amber} Amber, ${digestMetrics.red} Red across ${digestMetrics.projects} projects.`,
        emailedTo: staff
          .filter((s) => ["CEO", "SVP", "VP", "CompanyAdmin"].includes(s.role))
          .map((s) => s.email)
          .join(","),
      },
    });

    await sendEmail({
      companyId: company.id,
      type: "weekly_company",
      dedupeKey: `weekly:company:${company.id}:${format(periodStart, "yyyy-MM-dd")}`,
      to: staff
        .filter((s) => ["CEO", "SVP", "VP", "CompanyAdmin"].includes(s.role))
        .map((s) => s.email),
      subject: `Weekly management digest — ${company.name}`,
      html: `<p>${digest.narrative}</p><pre>${JSON.stringify(digestMetrics, null, 2)}</pre>`,
      entityType: "WeeklyReport",
      entityId: digest.id,
    });
    created.push(digest.id);
  }

  return { created: created.length };
}
