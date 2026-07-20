import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";

export type WorkPeriod = "day" | "week" | "month" | "quarter" | "year";

/** Standard productive hours per estimate day (matches billing day). */
export const HOURS_PER_ESTIMATE_DAY = 8;

export function periodBounds(period: WorkPeriod, ref = new Date()) {
  switch (period) {
    case "day":
      return { start: startOfDay(ref), end: endOfDay(ref), label: "Day" };
    case "week":
      return {
        start: startOfWeek(ref, { weekStartsOn: 1 }),
        end: endOfWeek(ref, { weekStartsOn: 1 }),
        label: "Week",
      };
    case "month":
      return { start: startOfMonth(ref), end: endOfMonth(ref), label: "Month" };
    case "quarter":
      return { start: startOfQuarter(ref), end: endOfQuarter(ref), label: "Quarter" };
    case "year":
      return { start: startOfYear(ref), end: endOfYear(ref), label: "Year" };
  }
}

export const KIND_LEVEL: Record<string, number> = {
  epic: 1,
  feature: 2,
  story: 3,
};

export type TaskSchedule = {
  estimateDays?: number | null;
  estimateHours?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  clientDeadline?: Date | null;
  resourceDeadline?: Date | null;
  createdAt?: Date;
};

export function taskEstimateDays(task: TaskSchedule): number {
  if (task.estimateDays != null && !Number.isNaN(task.estimateDays)) {
    return task.estimateDays;
  }
  if (task.estimateHours != null && !Number.isNaN(task.estimateHours)) {
    return task.estimateHours / HOURS_PER_ESTIMATE_DAY;
  }
  return 0;
}

export function taskEstimateHours(task: TaskSchedule): number {
  return taskEstimateDays(task) * HOURS_PER_ESTIMATE_DAY;
}

function taskWindow(task: TaskSchedule, periodStart: Date, periodEnd: Date) {
  const start = startOfDay(task.startDate ?? task.createdAt ?? periodStart);
  const end = endOfDay(
    task.endDate ?? task.clientDeadline ?? task.resourceDeadline ?? periodEnd,
  );
  return { start, end };
}

/** Calendar days in [start, end] inclusive (minimum 1). */
function inclusiveDays(start: Date, end: Date): number {
  return Math.max(1, differenceInCalendarDays(end, start) + 1);
}

/**
 * Portion of task estimate (in days) that falls inside the selected
 * day / week / month / quarter / year window.
 */
export function plannedDaysInPeriod(
  task: TaskSchedule,
  periodStart: Date,
  periodEnd: Date,
): number {
  const totalDays = taskEstimateDays(task);
  if (totalDays <= 0) return 0;

  const { start: tStart, end: tEnd } = taskWindow(task, periodStart, periodEnd);
  const overlapStart = maxDate([tStart, periodStart]);
  const overlapEnd = minDate([tEnd, periodEnd]);
  if (overlapStart > overlapEnd) return 0;

  const span = inclusiveDays(tStart, tEnd);
  const overlap = inclusiveDays(overlapStart, overlapEnd);
  return (totalDays * overlap) / span;
}

export function plannedHoursInPeriod(
  task: TaskSchedule,
  periodStart: Date,
  periodEnd: Date,
): number {
  return plannedDaysInPeriod(task, periodStart, periodEnd) * HOURS_PER_ESTIMATE_DAY;
}

/** True if task schedule overlaps the period (or has no schedule → include). */
export function taskOverlapsPeriod(
  task: TaskSchedule,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  if (!task.startDate && !task.endDate && !task.clientDeadline && !task.resourceDeadline) {
    return true;
  }
  const { start: tStart, end: tEnd } = taskWindow(task, periodStart, periodEnd);
  return tStart <= periodEnd && tEnd >= periodStart;
}
