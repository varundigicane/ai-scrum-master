import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Teams-side daily status write.
 *
 * Deliberately separate from POST /api/status/submit: the web path authorizes with a
 * magic token (whose raw value is never stored, so the bot cannot reuse it), while the
 * bot authorizes with the AAD identity behind TeamsIdentity. Both paths must produce
 * identical rows — prisma/smoke-teams-relay.ts asserts that.
 */

export const statusInputSchema = z.object({
  productiveHours: z.coerce.number().min(0).max(24),
  nonProductiveHours: z.coerce.number().min(0).max(24),
  narrative: z.string().optional(),
  blockers: z.string().optional(),
  progressPct: z.coerce.number().min(0).max(100).optional(),
  projectId: z.string().optional(),
  items: z
    .array(
      z.object({
        taskId: z.string().optional(),
        taskTitle: z.string().optional(),
        hours: z.coerce.number().min(0).default(0),
        progressPct: z.coerce.number().min(0).max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

export type StatusInput = z.infer<typeof statusInputSchema>;

export type StatusTask = {
  id: string;
  displayId: string | null;
  title: string;
  progressPct: number;
  projectId: string;
  projectName: string;
};

export type StatusContext = {
  requestId: string;
  resourceName: string;
  expiresAt: Date;
  windowDate: Date;
  projects: { id: string; name: string }[];
  tasks: StatusTask[];
  existing: {
    productiveHours: number;
    nonProductiveHours: number;
    narrative: string | null;
    blockers: string | null;
    progressPct: number | null;
    projectId: string | null;
  } | null;
};

export type StatusContextResult =
  | { ok: true; context: StatusContext }
  | { ok: false; reason: "no_window" | "no_request" | "on_leave" | "expired" };

/** The most recent status window for a company, whether or not it is still open. */
async function latestRequestForResource(companyId: string, resourceId: string) {
  return prisma.statusRequest.findFirst({
    where: { resourceId, statusWindow: { companyId } },
    orderBy: { statusWindow: { date: "desc" } },
    include: { statusWindow: true, dailyStatus: true, resource: true },
  });
}

export async function getStatusContext(
  companyId: string,
  resourceId: string,
): Promise<StatusContextResult> {
  const request = await latestRequestForResource(companyId, resourceId);
  if (!request) return { ok: false, reason: "no_request" };
  if (request.state === "skipped_leave") return { ok: false, reason: "on_leave" };

  const expired = request.state === "expired" || new Date() > request.statusWindow.expiresAt;
  if (expired) return { ok: false, reason: "expired" };

  const assignments = await prisma.resourceAssignment.findMany({
    where: { resourceId, active: true },
    include: {
      project: {
        include: { tasks: { where: { status: { not: "done" } } } },
      },
    },
  });

  const tasks: StatusTask[] = assignments.flatMap((a) =>
    a.project.tasks
      .filter((t) => !t.resourceId || t.resourceId === resourceId)
      .map((t) => ({
        id: t.id,
        displayId: t.displayId,
        title: t.title,
        progressPct: t.progressPct,
        projectId: a.project.id,
        projectName: a.project.name,
      })),
  );

  return {
    ok: true,
    context: {
      requestId: request.id,
      resourceName: request.resource.name,
      expiresAt: request.statusWindow.expiresAt,
      windowDate: request.statusWindow.date,
      projects: assignments.map((a) => ({ id: a.project.id, name: a.project.name })),
      tasks,
      existing: request.dailyStatus
        ? {
            productiveHours: request.dailyStatus.productiveHours,
            nonProductiveHours: request.dailyStatus.nonProductiveHours,
            narrative: request.dailyStatus.narrative,
            blockers: request.dailyStatus.blockers,
            progressPct: request.dailyStatus.progressPct,
            projectId: request.dailyStatus.projectId,
          }
        : null,
    },
  };
}

export type WriteResult =
  | { ok: true; statusId: string; isUpdate: boolean }
  | { ok: false; reason: "no_window" | "no_request" | "on_leave" | "expired" };

export async function writeDailyStatusForResource(args: {
  companyId: string;
  resourceId: string;
  data: StatusInput;
}): Promise<WriteResult> {
  const { companyId, resourceId, data } = args;

  const request = await latestRequestForResource(companyId, resourceId);
  if (!request) return { ok: false, reason: "no_request" };
  if (request.state === "skipped_leave") return { ok: false, reason: "on_leave" };

  if (request.state === "expired" || new Date() > request.statusWindow.expiresAt) {
    if (request.state === "pending") {
      await prisma.statusRequest.update({
        where: { id: request.id },
        data: { state: "expired" },
      });
    }
    return { ok: false, reason: "expired" };
  }

  const isUpdate = Boolean(request.dailyStatus);
  const items = data.items ?? [];

  // Prisma reads `undefined` as "leave this column alone", which would silently keep a
  // stale blocker after someone clears the field on the card. What the card shows is
  // what gets saved, so absent optional fields are written as null.
  const fields = {
    productiveHours: data.productiveHours,
    nonProductiveHours: data.nonProductiveHours,
    narrative: data.narrative ?? null,
    blockers: data.blockers ?? null,
    progressPct: data.progressPct ?? null,
    projectId: data.projectId || null,
  };

  const status = await prisma.$transaction(async (tx) => {
    await tx.statusRequest.update({
      where: { id: request.id },
      data: {
        state: "submitted",
        submittedAt: new Date(),
        openedAt: request.openedAt ?? new Date(),
      },
    });

    const itemRows = items.map((item) => ({
      taskId: item.taskId || null,
      taskTitle: item.taskTitle,
      hours: item.hours,
      progressPct: item.progressPct,
      notes: item.notes,
    }));

    if (request.dailyStatus) {
      await tx.dailyStatusItem.deleteMany({ where: { dailyStatusId: request.dailyStatus.id } });
      return tx.dailyStatus.update({
        where: { id: request.dailyStatus.id },
        data: { ...fields, items: { create: itemRows } },
      });
    }

    return tx.dailyStatus.create({
      data: {
        ...fields,
        statusRequestId: request.id,
        resourceId: request.resourceId,
        date: request.statusWindow.date,
        items: { create: itemRows },
      },
    });
  });

  // Same rollup rule the web submit route applies.
  for (const item of items) {
    if (item.taskId && item.progressPct != null) {
      await prisma.task.update({
        where: { id: item.taskId },
        data: {
          progressPct: item.progressPct,
          status: item.progressPct >= 100 ? "done" : "in_progress",
        },
      });
    }
  }

  return { ok: true, statusId: status.id, isUpdate };
}

/** Direct task progress update used by the `update ACME-3 70%` command. */
export async function updateTaskProgress(args: {
  companyId: string;
  resourceId: string;
  displayIdOrTitle: string;
  progressPct: number;
}): Promise<{ ok: true; taskId: string; title: string } | { ok: false; reason: "not_found" }> {
  const { companyId, resourceId, displayIdOrTitle, progressPct } = args;

  const task = await prisma.task.findFirst({
    where: {
      project: { account: { companyId } },
      OR: [
        { displayId: { equals: displayIdOrTitle, mode: "insensitive" } },
        { title: { contains: displayIdOrTitle, mode: "insensitive" } },
      ],
      AND: [
        {
          OR: [
            { resourceId },
            { resourceId: null, project: { assignments: { some: { resourceId, active: true } } } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, displayId: true },
  });

  if (!task) return { ok: false, reason: "not_found" };

  await prisma.task.update({
    where: { id: task.id },
    data: {
      progressPct,
      status: progressPct >= 100 ? "done" : "in_progress",
    },
  });

  return { ok: true, taskId: task.id, title: task.displayId ? `${task.displayId} · ${task.title}` : task.title };
}
