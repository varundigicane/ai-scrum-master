import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { buildMonthlyBilling, countWeekdays, HOURS_PER_DAY } from "@/lib/billing";

export type GtsDraftLine = {
  projectId: string | null;
  subProjectName: string;
  featureName: string;
  uatDefects: number;
  actualEffortHrs: number;
  remarks: string | null;
};

export type GtsMonthDraft = {
  accountId: string;
  accountName: string;
  projectName: string;
  projectManagers: string | null;
  technology: string | null;
  domain: string | null;
  lines: GtsDraftLine[];
  totalActualEffortHrs: number;
  totalWorkingHrs: number;
  totalAvailableHrs: number;
  billableResourceCount: number;
  availableResourceCount: number;
  utilizationPct: number;
  availabilityPct: number;
  overallDdd: number;
};

function monthBounds(year: number, month: number) {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  return { start, end };
}

/** Feature label for a project: prefer open features, else phase label. */
function featureLabelForProject(
  requirements: { kind: string; title: string; closed: boolean }[],
  phase: string,
): string {
  const features = requirements.filter((r) => r.kind === "feature" && !r.closed);
  if (features.length === 1) return features[0].title;
  if (features.length > 1) return features.map((f) => f.title).join("; ");
  const stories = requirements.filter((r) => r.kind === "story" && !r.closed);
  if (stories.length === 1) return stories[0].title;
  return `${phase} delivery`;
}

/**
 * Build a GTS month draft from live system data (daily status hours, UAT defects, billing).
 * Does not write to DB — used to seed / refresh monthly report lines.
 */
export async function buildGtsMonthDraft(opts: {
  companyId: string;
  accountId: string;
  year: number;
  month: number;
}): Promise<GtsMonthDraft> {
  const { companyId, accountId, year, month } = opts;
  const { start, end } = monthBounds(year, month);

  const account = await prisma.account.findFirst({
    where: { id: accountId, companyId },
    include: {
      projects: {
        where: { active: true },
        include: {
          requirements: { select: { kind: true, title: true, closed: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!account) throw new Error("Account not found");

  const projectIds = account.projects.map((p) => p.id);

  const [statuses, defects, billing] = await Promise.all([
    projectIds.length
      ? prisma.dailyStatus.findMany({
          where: {
            projectId: { in: projectIds },
            date: { gte: start, lte: end },
          },
          select: { projectId: true, productiveHours: true, nonProductiveHours: true },
        })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.defect.findMany({
          where: {
            projectId: { in: projectIds },
            createdAt: { gte: start, lte: end },
          },
          select: { projectId: true, source: true },
        })
      : Promise.resolve([]),
    buildMonthlyBilling({ companyId, year, month }),
  ]);

  const hoursByProject = new Map<string, number>();
  for (const s of statuses) {
    if (!s.projectId) continue;
    const hrs = (s.productiveHours ?? 0) + (s.nonProductiveHours ?? 0);
    hoursByProject.set(s.projectId, (hoursByProject.get(s.projectId) ?? 0) + hrs);
  }

  const uatByProject = new Map<string, number>();
  for (const d of defects) {
    // Treat client-informed defects as UAT/client defects for GTS column
    if (d.source === "client_informed") {
      uatByProject.set(d.projectId, (uatByProject.get(d.projectId) ?? 0) + 1);
    }
  }

  const accountBilling = billing.lines.filter((l) => l.accountId === accountId);
  const billableResourceIds = new Set(
    accountBilling.filter((l) => l.assignmentBillable && l.projectBillable).map((l) => l.resourceId),
  );
  const availableResourceIds = new Set(accountBilling.map((l) => l.resourceId));

  const monthWeekdays = countWeekdays(start, end);
  const totalWorkingDays =
    accountBilling.reduce((max, l) => Math.max(max, l.totalWorkingDays), 0) || monthWeekdays;

  // Prefer status hours; fall back to billable-day hours for projects with no status yet
  const billableHrsByProject = new Map<string, number>();
  for (const l of accountBilling) {
    if (!l.assignmentBillable || !l.projectBillable) continue;
    const hrs = l.billableDays * HOURS_PER_DAY;
    billableHrsByProject.set(
      l.projectId,
      (billableHrsByProject.get(l.projectId) ?? 0) + hrs,
    );
  }

  const lines: GtsDraftLine[] = account.projects.map((p) => {
    const statusHrs = hoursByProject.get(p.id) ?? 0;
    const fallbackHrs = billableHrsByProject.get(p.id) ?? 0;
    return {
      projectId: p.id,
      subProjectName: p.name,
      featureName: featureLabelForProject(p.requirements, p.phase),
      uatDefects: uatByProject.get(p.id) ?? 0,
      actualEffortHrs: statusHrs > 0 ? statusHrs : fallbackHrs,
      remarks: null,
    };
  });

  const totalActualEffortHrs = lines.reduce((s, l) => s + l.actualEffortHrs, 0);
  const totalAvailableHrs =
    availableResourceIds.size * totalWorkingDays * HOURS_PER_DAY;
  const totalWorkingHrs = totalAvailableHrs;
  const totalBillableHrs = [...billableHrsByProject.values()].reduce((a, b) => a + b, 0);

  const utilizationPct =
    totalAvailableHrs > 0
      ? Math.min(100, Math.round((totalBillableHrs / totalAvailableHrs) * 1000) / 10)
      : 0;
  const availabilityPct =
    availableResourceIds.size > 0
      ? Math.min(
          100,
          Math.round((billableResourceIds.size / availableResourceIds.size) * 1000) / 10,
        )
      : 0;

  const totalUat = lines.reduce((s, l) => s + l.uatDefects, 0);
  const overallDdd =
    totalActualEffortHrs > 0 ? totalUat / totalActualEffortHrs : 0;

  return {
    accountId: account.id,
    accountName: account.name,
    projectName: account.code ? `${account.code}` : account.name,
    projectManagers: account.projectManagers,
    technology: account.technology,
    domain: account.domain,
    lines,
    totalActualEffortHrs,
    totalWorkingHrs,
    totalAvailableHrs,
    billableResourceCount: billableResourceIds.size,
    availableResourceCount: availableResourceIds.size,
    utilizationPct,
    availabilityPct,
    overallDdd,
  };
}

export function summarizeGtsLines(
  lines: { uatDefects: number; actualEffortHrs: number }[],
  utilizationPct: number | null,
  availabilityPct: number | null,
  resourceCounts?: { billable: number; available: number; workingHrs: number; availableHrs: number },
) {
  const totalActualEffortHrs = lines.reduce((s, l) => s + l.actualEffortHrs, 0);
  const totalUat = lines.reduce((s, l) => s + l.uatDefects, 0);
  const overallDdd = totalActualEffortHrs > 0 ? totalUat / totalActualEffortHrs : 0;
  return {
    totalActualEffortHrs,
    totalWorkingHrs: resourceCounts?.workingHrs ?? 0,
    totalAvailableHrs: resourceCounts?.availableHrs ?? 0,
    billableResourceCount: resourceCounts?.billable ?? 0,
    availableResourceCount: resourceCounts?.available ?? 0,
    utilizationPct: utilizationPct ?? 0,
    availabilityPct: availabilityPct ?? 0,
    overallDdd,
  };
}

export function deliveredDefectDensity(uatDefects: number, actualEffortHrs: number) {
  if (actualEffortHrs <= 0) return 0;
  return uatDefects / actualEffortHrs;
}

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function monthTabLabel(year: number, month: number) {
  const yy = String(year).slice(-2);
  return `${MONTH_LABELS[month - 1]}${yy}`;
}
