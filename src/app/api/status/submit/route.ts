import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import { notifyStatusChange } from "@/lib/agent";

const schema = z.object({
  token: z.string().min(10),
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

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const tokenHash = hashToken(data.token);
  const request = await prisma.statusRequest.findUnique({
    where: { tokenHash },
    include: {
      statusWindow: { include: { company: true } },
      resource: true,
      dailyStatus: true,
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  if (request.state === "skipped_leave") {
    return NextResponse.json({ error: "You are on leave today" }, { status: 400 });
  }

  if (request.state === "expired" || new Date() > request.statusWindow.expiresAt) {
    if (request.state === "pending") {
      await prisma.statusRequest.update({
        where: { id: request.id },
        data: { state: "expired" },
      });
    }
    return NextResponse.json({ error: "Link expired" }, { status: 403 });
  }

  const isUpdate = Boolean(request.dailyStatus);

  const status = await prisma.$transaction(async (tx) => {
    await tx.statusRequest.update({
      where: { id: request.id },
      data: {
        state: "submitted",
        submittedAt: new Date(),
        openedAt: request.openedAt ?? new Date(),
      },
    });

    if (request.dailyStatus) {
      await tx.dailyStatusItem.deleteMany({ where: { dailyStatusId: request.dailyStatus.id } });
      return tx.dailyStatus.update({
        where: { id: request.dailyStatus.id },
        data: {
          productiveHours: data.productiveHours,
          nonProductiveHours: data.nonProductiveHours,
          narrative: data.narrative,
          blockers: data.blockers,
          progressPct: data.progressPct,
          projectId: data.projectId || null,
          items: {
            create: (data.items ?? []).map((item) => ({
              taskId: item.taskId || null,
              taskTitle: item.taskTitle,
              hours: item.hours,
              progressPct: item.progressPct,
              notes: item.notes,
            })),
          },
        },
      });
    }

    return tx.dailyStatus.create({
      data: {
        statusRequestId: request.id,
        resourceId: request.resourceId,
        projectId: data.projectId || null,
        date: request.statusWindow.date,
        productiveHours: data.productiveHours,
        nonProductiveHours: data.nonProductiveHours,
        narrative: data.narrative,
        blockers: data.blockers,
        progressPct: data.progressPct,
        items: {
          create: (data.items ?? []).map((item) => ({
            taskId: item.taskId || null,
            taskTitle: item.taskTitle,
            hours: item.hours,
            progressPct: item.progressPct,
            notes: item.notes,
          })),
        },
      },
    });
  });

  // Update task progress if provided
  for (const item of data.items ?? []) {
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

  await notifyStatusChange({
    companyId: request.statusWindow.companyId,
    resourceName: request.resource.name,
    resourceId: request.resourceId,
    statusId: status.id,
    isUpdate,
    productiveHours: data.productiveHours,
    nonProductiveHours: data.nonProductiveHours,
    blockers: data.blockers,
    narrative: data.narrative,
  });

  return NextResponse.json({ ok: true, statusId: status.id, isUpdate });
}
