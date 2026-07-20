import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  isSaturday,
  isSunday,
  isWithinInterval,
  max as dateMax,
  min as dateMin,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { prisma } from "@/lib/prisma";

/** Contracted hours per billable day */
export const HOURS_PER_DAY = 8;

export type BillingLine = {
  accountId: string;
  accountName: string;
  projectId: string;
  projectName: string;
  resourceId: string;
  resourceName: string;
  employeeId: string | null;
  hourlyRate: number;
  assignmentBillable: boolean;
  totalWorkingDays: number;
  leaveDays: number;
  extraWorkingDays: number;
  billableDays: number;
  billingAmount: number;
  projectBillable: boolean;
};

function isWeekend(d: Date) {
  return isSaturday(d) || isSunday(d);
}

/** Weekdays in [from, to] inclusive */
export function countWeekdays(from: Date, to: Date): number {
  if (from > to) return 0;
  return eachDayOfInterval({ start: startOfDay(from), end: startOfDay(to) }).filter(
    (d) => !isWeekend(d),
  ).length;
}

/** Weekday leave days overlapping period; project-scoped leave only counts for that project */
export function countLeaveWeekdaysInPeriod(
  leaves: { startDate: Date; endDate: Date; projectId: string | null; status: string }[],
  periodStart: Date,
  periodEnd: Date,
  projectId: string,
): number {
  const days = new Set<string>();
  for (const leave of leaves) {
    if (leave.status !== "approved") continue;
    if (leave.projectId && leave.projectId !== projectId) continue;
    const from = dateMax([startOfDay(leave.startDate), periodStart]);
    const to = dateMin([startOfDay(leave.endDate), periodEnd]);
    if (from > to) continue;
    for (const d of eachDayOfInterval({ start: from, end: to })) {
      if (!isWeekend(d)) days.add(d.toISOString().slice(0, 10));
    }
  }
  return days.size;
}

export function countExtraDaysInPeriod(
  extras: { date: Date; projectId: string }[],
  periodStart: Date,
  periodEnd: Date,
  projectId: string,
): number {
  const days = new Set<string>();
  for (const e of extras) {
    if (e.projectId !== projectId) continue;
    const d = startOfDay(e.date);
    if (d >= periodStart && d <= periodEnd) {
      days.add(d.toISOString().slice(0, 10));
    }
  }
  return days.size;
}

/**
 * Effective working-day window for a project in a month:
 * intersection of calendar month and project start/end (if set).
 */
export function projectMonthWindow(
  year: number,
  month: number,
  projectStart: Date | null,
  projectEnd: Date | null,
): { start: Date; end: Date } | null {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  let start = monthStart;
  let end = monthEnd;
  if (projectStart) start = dateMax([start, startOfDay(projectStart)]);
  if (projectEnd) end = dateMin([end, startOfDay(projectEnd)]);
  if (start > end) return null;
  return { start, end };
}

/**
 * billableDays = totalWorkingDays - leaveDays + extraWorkingDays
 * billingAmount = hourlyRate * HOURS_PER_DAY * billableDays  (only when assignment is billable)
 */
export function computeBillableDays(
  totalWorkingDays: number,
  leaveDays: number,
  extraWorkingDays: number,
): number {
  return Math.max(0, totalWorkingDays - leaveDays + extraWorkingDays);
}

export function computeBillingAmount(
  hourlyRate: number,
  billableDays: number,
  assignmentBillable = true,
): number {
  if (!assignmentBillable) return 0;
  return hourlyRate * HOURS_PER_DAY * billableDays;
}

export async function buildMonthlyBilling(opts: {
  companyId: string;
  year: number;
  month: number;
  /** Optional override for total working days (applies as base before project window clamp ratio — or absolute) */
  totalWorkingDaysOverride?: number | null;
}): Promise<{
  year: number;
  month: number;
  hoursPerDay: number;
  lines: BillingLine[];
  byProject: {
    projectId: string;
    projectName: string;
    accountId: string;
    accountName: string;
    totalBilling: number;
    resources: number;
  }[];
  byAccount: { accountId: string; accountName: string; totalBilling: number }[];
  byResource: {
    resourceId: string;
    resourceName: string;
    employeeId: string | null;
    totalBilling: number;
  }[];
  grandTotal: number;
}> {
  const { companyId, year, month } = opts;

  const override =
    opts.totalWorkingDaysOverride != null
      ? { totalWorkingDays: opts.totalWorkingDaysOverride }
      : await prisma.billingMonthOverride.findUnique({
          where: { companyId_year_month: { companyId, year, month } },
        });

  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const defaultMonthWeekdays = countWeekdays(monthStart, monthEnd);

  const assignments = await prisma.resourceAssignment.findMany({
    where: {
      active: true,
      resource: { companyId, active: true },
      project: { active: true, billable: true, account: { companyId } },
    },
    include: {
      resource: {
        include: {
          leaves: {
            where: {
              status: "approved",
              startDate: { lte: monthEnd },
              endDate: { gte: monthStart },
            },
          },
          extraWorkingDays: {
            where: {
              date: { gte: monthStart, lte: monthEnd },
            },
          },
        },
      },
      project: { include: { account: true } },
    },
  });

  const lines: BillingLine[] = [];

  for (const a of assignments) {
    const window = projectMonthWindow(year, month, a.project.startDate, a.project.endDate);
    if (!window) continue;

    const computedWeekdays = countWeekdays(window.start, window.end);
    // If company override set for full month, scale by project window weekdays / month weekdays
    let totalWorkingDays = computedWeekdays;
    if (override?.totalWorkingDays != null && defaultMonthWeekdays > 0) {
      totalWorkingDays = Math.round(
        (override.totalWorkingDays * computedWeekdays) / defaultMonthWeekdays,
      );
    }

    const leaveDays = countLeaveWeekdaysInPeriod(
      a.resource.leaves,
      window.start,
      window.end,
      a.projectId,
    );
    const extraWorkingDays = countExtraDaysInPeriod(
      a.resource.extraWorkingDays,
      window.start,
      window.end,
      a.projectId,
    );
    const billableDays = computeBillableDays(totalWorkingDays, leaveDays, extraWorkingDays);
    const assignmentBillable = a.billable;
    const effectiveRate = assignmentBillable ? a.hourlyRate : 0;
    const billingAmount = computeBillingAmount(a.hourlyRate, billableDays, assignmentBillable);

    lines.push({
      accountId: a.project.accountId,
      accountName: a.project.account.name,
      projectId: a.projectId,
      projectName: a.project.name,
      resourceId: a.resourceId,
      resourceName: a.resource.name,
      employeeId: a.resource.employeeId,
      hourlyRate: effectiveRate,
      assignmentBillable,
      totalWorkingDays,
      leaveDays,
      extraWorkingDays,
      billableDays: assignmentBillable ? billableDays : 0,
      billingAmount,
      projectBillable: a.project.billable,
    });
  }

  const byProjectMap = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      accountId: string;
      accountName: string;
      totalBilling: number;
      resources: number;
    }
  >();
  const byAccountMap = new Map<string, { accountId: string; accountName: string; totalBilling: number }>();
  const byResourceMap = new Map<
    string,
    { resourceId: string; resourceName: string; employeeId: string | null; totalBilling: number }
  >();

  for (const line of lines) {
    if (!line.assignmentBillable) continue;

    const p = byProjectMap.get(line.projectId) ?? {
      projectId: line.projectId,
      projectName: line.projectName,
      accountId: line.accountId,
      accountName: line.accountName,
      totalBilling: 0,
      resources: 0,
    };
    p.totalBilling += line.billingAmount;
    p.resources += 1;
    byProjectMap.set(line.projectId, p);

    const acc = byAccountMap.get(line.accountId) ?? {
      accountId: line.accountId,
      accountName: line.accountName,
      totalBilling: 0,
    };
    acc.totalBilling += line.billingAmount;
    byAccountMap.set(line.accountId, acc);

    const r = byResourceMap.get(line.resourceId) ?? {
      resourceId: line.resourceId,
      resourceName: line.resourceName,
      employeeId: line.employeeId,
      totalBilling: 0,
    };
    r.totalBilling += line.billingAmount;
    byResourceMap.set(line.resourceId, r);
  }

  const grandTotal = lines.reduce((s, l) => s + l.billingAmount, 0);

  return {
    year,
    month,
    hoursPerDay: HOURS_PER_DAY,
    lines,
    byProject: [...byProjectMap.values()].sort((a, b) => a.projectName.localeCompare(b.projectName)),
    byAccount: [...byAccountMap.values()].sort((a, b) => a.accountName.localeCompare(b.accountName)),
    byResource: [...byResourceMap.values()].sort((a, b) => a.resourceName.localeCompare(b.resourceName)),
    grandTotal,
  };
}

/** Helper for UI date lists */
export function listDatesBetween(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) });
}

export function addOneDay(d: Date) {
  return addDays(d, 1);
}

export function dateInRange(d: Date, start: Date, end: Date) {
  return isWithinInterval(startOfDay(d), { start: startOfDay(start), end: startOfDay(end) });
}
