import { prisma } from "@/lib/prisma";
import type { DefectSeverity, ProjectPhase, StatusRequestState, TaskStatus } from "@/generated/prisma/enums";
import type { ChartSlice, OverviewChartsData, OverviewReminderItem } from "@/lib/overview-palette";

export type { ChartSlice, OverviewChartsData, OverviewReminderItem } from "@/lib/overview-palette";
export { OVERVIEW_COLORS } from "@/lib/overview-palette";

const PHASE_ORDER: ProjectPhase[] = ["Requirements", "Design", "Dev", "Test", "UAT", "Closed"];
const SEVERITY_ORDER: DefectSeverity[] = ["low", "medium", "high", "critical"];
const TASK_STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
const STATUS_STATE_ORDER: StatusRequestState[] = ["submitted", "pending", "expired", "skipped_leave"];

/** Same rule as Overview RAG table: overdue → Red; critical open → Amber; else Green. */
export function projectRag(input: {
  tasks: Array<{
    status: TaskStatus;
    clientDeadline: Date | null;
    resourceDeadline: Date | null;
  }>;
  defects: Array<{ status: string; severity: DefectSeverity }>;
}): "Red" | "Amber" | "Green" {
  const now = new Date();
  const overdue = input.tasks.filter(
    (t) =>
      t.status !== "done" &&
      ((t.clientDeadline && t.clientDeadline < now) || (t.resourceDeadline && t.resourceDeadline < now)),
  ).length;
  if (overdue > 0) return "Red";
  const openDef = input.defects.filter((d) => d.status !== "closed");
  if (openDef.length > 0 && openDef.some((d) => d.severity === "critical")) return "Amber";
  return "Green";
}

function fillSeries(order: string[], counts: Map<string, number>): ChartSlice[] {
  return order.map((name) => ({ name, value: counts.get(name) ?? 0 }));
}

export async function getOverviewCharts(companyId: string, userId: string): Promise<OverviewChartsData> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [
    accounts,
    projects,
    resources,
    openDefects,
    pendingStatus,
    overdueTasks,
    activeProjects,
    openDefectRows,
    taskGroups,
    statusWindows,
    openReminders,
    meetingEvents,
  ] = await Promise.all([
    prisma.account.count({ where: { companyId, active: true } }),
    prisma.project.count({ where: { account: { companyId }, active: true } }),
    prisma.resource.count({ where: { companyId, active: true } }),
    prisma.defect.count({
      where: { project: { account: { companyId } }, status: { not: "closed" } },
    }),
    prisma.statusRequest.count({
      where: { state: "pending", resource: { companyId } },
    }),
    prisma.task.count({
      where: {
        status: { not: "done" },
        project: { account: { companyId } },
        OR: [{ clientDeadline: { lt: now } }, { resourceDeadline: { lt: now } }],
      },
    }),
    prisma.project.findMany({
      where: { account: { companyId }, active: true },
      select: {
        phase: true,
        tasks: { select: { status: true, clientDeadline: true, resourceDeadline: true } },
        defects: { select: { status: true, severity: true } },
      },
    }),
    prisma.defect.findMany({
      where: { project: { account: { companyId } }, status: { not: "closed" } },
      select: { severity: true },
    }),
    prisma.task.groupBy({
      by: ["status"],
      where: { project: { account: { companyId } } },
      _count: { _all: true },
    }),
    prisma.statusWindow.findMany({
      where: { companyId, date: { gte: dayStart, lt: dayEnd } },
      include: { requests: { select: { state: true } } },
      take: 1,
    }),
    prisma.meetingNoteReminder.findMany({
      where: {
        done: false,
        createdById: userId,
        meetingNote: {
          companyId,
          OR: [
            { createdById: userId },
            { AND: [{ shares: { some: { userId } } }, { summary: { isNot: null } }] },
          ],
        },
        dueAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      },
      include: { meetingNote: { select: { id: true, title: true } } },
      orderBy: { dueAt: "asc" },
      take: 30,
    }),
    prisma.meetingEvent.findMany({
      where: {
        companyId,
        meetingNote: {
          OR: [
            { createdById: userId },
            { AND: [{ shares: { some: { userId } } }, { summary: { isNot: null } }] },
          ],
        },
        startsAt: {
          gte: dayStart,
          lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        meetingNoteId: true,
      },
      orderBy: { startsAt: "asc" },
      take: 20,
    }),
  ]);

  const ragCounts = new Map<string, number>([
    ["Red", 0],
    ["Amber", 0],
    ["Green", 0],
  ]);
  const phaseCounts = new Map<string, number>();
  for (const p of activeProjects) {
    phaseCounts.set(p.phase, (phaseCounts.get(p.phase) ?? 0) + 1);
    const rag = projectRag(p);
    ragCounts.set(rag, (ragCounts.get(rag) ?? 0) + 1);
  }

  const severityCounts = new Map<string, number>();
  for (const d of openDefectRows) {
    severityCounts.set(d.severity, (severityCounts.get(d.severity) ?? 0) + 1);
  }

  const taskCounts = new Map<string, number>();
  for (const g of taskGroups) {
    taskCounts.set(g.status, g._count._all);
  }

  const statusCounts = new Map<string, number>();
  for (const state of STATUS_STATE_ORDER) statusCounts.set(state, 0);
  const todayWindow = statusWindows[0];
  if (todayWindow) {
    for (const r of todayWindow.requests) {
      statusCounts.set(r.state, (statusCounts.get(r.state) ?? 0) + 1);
    }
  }

  const reminderItems: OverviewReminderItem[] = openReminders.map((r) => ({
    id: r.id,
    noteId: r.meetingNote.id,
    noteTitle: r.meetingNote.title,
    dueAt: r.dueAt.toISOString(),
    note: r.note || "Follow-up",
    kind: "reminder" as const,
    overdue: r.dueAt.getTime() < now.getTime(),
  }));

  for (const e of meetingEvents) {
    reminderItems.push({
      id: e.id,
      noteId: e.meetingNoteId ?? "",
      noteTitle: e.title,
      dueAt: e.startsAt.toISOString(),
      note: "Scheduled meeting",
      kind: "meeting",
      overdue: e.startsAt.getTime() < now.getTime(),
    });
  }

  reminderItems.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const overdueReminders = reminderItems.filter((i) => i.overdue).length;
  const dueSoonReminders = reminderItems.filter((i) => !i.overdue).length;

  return {
    kpis: {
      accounts,
      projects,
      resources,
      overdueTasks,
      openDefects,
      pendingStatus,
      dueSoonReminders,
      overdueReminders,
    },
    rag: fillSeries(["Red", "Amber", "Green"], ragCounts),
    phases: fillSeries(PHASE_ORDER, phaseCounts),
    defectSeverity: fillSeries(SEVERITY_ORDER, severityCounts),
    taskStatus: fillSeries(TASK_STATUS_ORDER, taskCounts),
    statusToday: fillSeries(STATUS_STATE_ORDER, statusCounts),
    reminders: {
      dueSoon: dueSoonReminders,
      overdue: overdueReminders,
      items: reminderItems.slice(0, 10),
    },
  };
}
