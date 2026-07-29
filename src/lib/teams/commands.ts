import { TurnContext } from "botbuilder";
import { format, startOfDay } from "date-fns";
import type { Role } from "@/generated/prisma/enums";
import type { TeamsIdentity } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dailyStatusCard,
  helpCard,
  leaveApprovalCard,
  linkConfirmCard,
  missingNowCard,
  parsePreviewCard,
  standupCard,
  statusSavedCard,
  taskListCard,
  toAttachment,
  weeklyDigestCard,
  type AdaptiveCard,
} from "./cards";
import { parseStatusUpdate, summarizeForLead } from "./llm";
import {
  captureChannelConversation,
  captureUserConversation,
  findLinkCandidate,
  linkIdentityToResource,
  resolveCompanyId,
} from "./link";
import { identityTargetForResource, leadTargets, sendTeamsMessage } from "./notify";
import { announceAdhocBlocker, announceStatus, nudgePendingInWindow } from "./relay";
import {
  getStatusContext,
  statusInputSchema,
  updateTaskProgress,
  writeDailyStatusForResource,
  type StatusInput,
} from "./status-write";
import { isAiParseEnabled } from "./config";
import { allowTeamsCommand } from "./rate-limit";

const LEAD_ROLES: Role[] = ["ProjectManager", "AVP", "VP", "SVP", "CEO", "CompanyAdmin"];

type BotUser = {
  companyId: string;
  identity: TeamsIdentity;
  role: Role | null;
  isLead: boolean;
};

async function reply(context: TurnContext, card: AdaptiveCard): Promise<void> {
  await context.sendActivity({ attachments: [toAttachment(card)] });
}

async function logInteraction(args: {
  companyId: string;
  identity?: TeamsIdentity | null;
  activityId?: string;
  command: string;
  inputText?: string;
  parsedJson?: string;
  outcome: "ok" | "rejected" | "error";
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.teamsInteraction.create({
      data: {
        companyId: args.companyId,
        teamsIdentityId: args.identity?.id,
        activityId: args.activityId,
        command: args.command,
        inputText: args.inputText?.slice(0, 2000),
        parsedJson: args.parsedJson?.slice(0, 4000),
        outcome: args.outcome,
        errorMessage: args.errorMessage?.slice(0, 1000),
      },
    });
  } catch (error) {
    console.error("[teams] failed to log interaction", error);
  }
}

async function resolveRole(identity: TeamsIdentity): Promise<Role | null> {
  if (identity.userId) {
    const user = await prisma.user.findUnique({ where: { id: identity.userId } });
    return user?.role ?? null;
  }
  if (identity.resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: identity.resourceId },
      include: { user: true },
    });
    return resource?.user?.role ?? null;
  }
  return null;
}

const STATUS_BLOCKED_MESSAGE: Record<string, string> = {
  no_window: "There is no status window open right now.",
  no_request: "I don't have a status request for you yet. It appears when today's window opens.",
  on_leave: "You're marked as on leave today, so no status is needed.",
  expired: "Today's status window has closed. Ask your project manager to reopen it if needed.",
};

/** Entry point for every inbound message activity. */
export async function handleTeamsMessage(context: TurnContext): Promise<void> {
  const activity = context.activity;
  const isPersonal = activity.conversation?.conversationType === "personal";

  if (!isPersonal) {
    await captureChannelConversation(context);
  }

  const companyId = await resolveCompanyId(activity);
  if (!companyId) {
    await context.sendActivity(
      "This Teams tenant isn't connected to an AI Scrum Master company yet. An admin can enable it under Dashboard → MS Teams.",
    );
    return;
  }

  const identity = await captureUserConversation(context);
  if (!identity) {
    await context.sendActivity("I couldn't work out who you are from this message.");
    return;
  }

  if (!allowTeamsCommand(identity.id)) {
    await context.sendActivity("That's a lot of messages at once — give me a minute and try again.");
    return;
  }

  const role = await resolveRole(identity);
  const user: BotUser = {
    companyId,
    identity,
    role,
    isLead: role !== null && LEAD_ROLES.includes(role),
  };

  const value = activity.value as Record<string, unknown> | undefined;
  if (value && typeof value.action === "string") {
    await handleCardAction(context, user, value);
    return;
  }

  const text = (TurnContext.removeRecipientMention(activity) ?? activity.text ?? "").trim();
  await handleText(context, user, text);
}

async function requireResource(context: TurnContext, user: BotUser): Promise<string | null> {
  if (user.identity.resourceId) return user.identity.resourceId;

  const candidate = await findLinkCandidate(user.companyId, user.identity.upn);
  if (candidate) {
    await reply(context, linkConfirmCard(candidate));
    return null;
  }

  await context.sendActivity(
    "Your Teams account isn't linked to a person in AI Scrum Master yet. Ask an admin to link you under Dashboard → MS Teams.",
  );
  return null;
}

async function handleText(context: TurnContext, user: BotUser, text: string): Promise<void> {
  const lower = text.toLowerCase();
  const activityId = context.activity.id;

  if (!text || lower === "help" || lower === "hi" || lower === "hello") {
    await reply(context, helpCard(user.isLead));
    return;
  }

  if (lower === "mute" || lower === "unmute") {
    const optedOut = lower === "mute";
    await prisma.teamsIdentity.update({ where: { id: user.identity.id }, data: { optedOut } });
    await context.sendActivity(
      optedOut
        ? "Muted. I won't send you direct messages until you say **unmute**."
        : "Unmuted. I'll message you when a status window opens.",
    );
    await logInteraction({ ...base(user, activityId), command: lower, outcome: "ok" });
    return;
  }

  if (lower === "link me" || lower === "link") {
    await requireResource(context, user);
    return;
  }

  if (lower === "status" || lower === "my status") {
    await openStatusForm(context, user);
    return;
  }

  if (lower === "my tasks" || lower === "tasks") {
    await showTasks(context, user);
    return;
  }

  const updateMatch = text.match(/^update\s+(.+?)\s+(\d{1,3})\s*%?$/i);
  if (updateMatch) {
    await applyTaskUpdate(context, user, updateMatch[1].trim(), Number(updateMatch[2]));
    return;
  }

  const blockerMatch = text.match(/^blocke(?:r|d)\s*:?\s*([\s\S]+)$/i);
  if (blockerMatch) {
    await raiseBlocker(context, user, blockerMatch[1].trim());
    return;
  }

  const leaveMatch = text.match(
    /^leave\s+(\d{4}-\d{2}-\d{2})(?:\s+(?:to|-|until)\s+(\d{4}-\d{2}-\d{2}))?\s*([\s\S]*)$/i,
  );
  if (leaveMatch) {
    await requestLeave(context, user, leaveMatch[1], leaveMatch[2], leaveMatch[3]?.trim());
    return;
  }

  if (lower === "standup" || lower === "stand up") {
    await showStandup(context, user);
    return;
  }

  if (lower === "missing" || lower === "who is missing") {
    await showMissing(context, user);
    return;
  }

  const reportMatch = text.match(/^report\s+project\s+(.+)$/i);
  if (reportMatch) {
    await showProjectReport(context, user, reportMatch[1].trim());
    return;
  }

  await handleFreeText(context, user, text);
}

function base(user: BotUser, activityId?: string) {
  return { companyId: user.companyId, identity: user.identity, activityId };
}

async function openStatusForm(context: TurnContext, user: BotUser): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  const status = await getStatusContext(user.companyId, resourceId);
  if (!status.ok) {
    await context.sendActivity(STATUS_BLOCKED_MESSAGE[status.reason]);
    return;
  }
  await reply(context, dailyStatusCard(status.context));
}

async function showTasks(context: TurnContext, user: BotUser): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  const status = await getStatusContext(user.companyId, resourceId);
  if (status.ok) {
    await reply(context, taskListCard(status.context.tasks));
    return;
  }

  // No open window is fine — the task list does not depend on one.
  const assignments = await prisma.resourceAssignment.findMany({
    where: { resourceId, active: true },
    include: { project: { include: { tasks: { where: { status: { not: "done" } } } } } },
  });
  const tasks = assignments.flatMap((a) =>
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
  await reply(context, taskListCard(tasks));
}

async function applyTaskUpdate(
  context: TurnContext,
  user: BotUser,
  ref: string,
  progressPct: number,
): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  if (progressPct < 0 || progressPct > 100) {
    await context.sendActivity("Progress has to be between 0 and 100.");
    return;
  }

  const result = await updateTaskProgress({
    companyId: user.companyId,
    resourceId,
    displayIdOrTitle: ref,
    progressPct,
  });

  if (!result.ok) {
    await context.sendActivity(`I couldn't find a task matching "${ref}" that's assigned to you.`);
    await logInteraction({
      ...base(user, context.activity.id),
      command: "update",
      inputText: ref,
      outcome: "rejected",
      errorMessage: "task not found",
    });
    return;
  }

  await context.sendActivity(`Updated **${result.title}** to ${progressPct}%.`);
  await logInteraction({
    ...base(user, context.activity.id),
    command: "update",
    inputText: `${ref} ${progressPct}`,
    outcome: "ok",
  });
}

async function raiseBlocker(context: TurnContext, user: BotUser, text: string): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  const resource = await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } });
  const status = await getStatusContext(user.companyId, resourceId);

  if (status.ok && status.context.existing) {
    const daily = await prisma.dailyStatus.findFirst({
      where: { statusRequestId: status.context.requestId },
    });
    if (daily) {
      const merged = daily.blockers?.trim() ? `${daily.blockers.trim()}\n${text}` : text;
      await prisma.dailyStatus.update({ where: { id: daily.id }, data: { blockers: merged } });
      await announceStatus(user.companyId, daily.id);
      await context.sendActivity("Added to today's status and flagged to your leads.");
      await logInteraction({ ...base(user, context.activity.id), command: "blocker", inputText: text, outcome: "ok" });
      return;
    }
  }

  const project = status.ok ? status.context.projects[0] : null;
  await announceAdhocBlocker({
    companyId: user.companyId,
    resourceName: resource.name,
    blockers: text,
    projectId: project?.id,
    projectName: project?.name,
  });
  await context.sendActivity("Flagged to your leads.");
  await logInteraction({ ...base(user, context.activity.id), command: "blocker", inputText: text, outcome: "ok" });
}

async function requestLeave(
  context: TurnContext,
  user: BotUser,
  startRaw: string,
  endRaw: string | undefined,
  reason: string | undefined,
): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  const startDate = new Date(`${startRaw}T00:00:00`);
  const endDate = new Date(`${endRaw ?? startRaw}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    await context.sendActivity("I need dates as YYYY-MM-DD, e.g. `leave 2026-08-03 to 2026-08-05 family event`.");
    return;
  }
  if (endDate < startDate) {
    await context.sendActivity("The end date is before the start date.");
    return;
  }

  const resource = await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } });
  const leave = await prisma.leave.create({
    data: {
      resourceId,
      type: "internal",
      status: "pending",
      startDate,
      endDate,
      reason: reason || null,
    },
  });

  await context.sendActivity(
    `Leave request logged for ${format(startDate, "yyyy-MM-dd")} → ${format(endDate, "yyyy-MM-dd")}. Your leads can approve it.`,
  );

  const targets = await leadTargets(user.companyId);
  await sendTeamsMessage({
    companyId: user.companyId,
    type: "leave_request",
    dedupeKey: `leave:${leave.id}`,
    targets,
    card: leaveApprovalCard({
      leaveId: leave.id,
      resourceName: resource.name,
      startLabel: format(startDate, "yyyy-MM-dd"),
      endLabel: format(endDate, "yyyy-MM-dd"),
      reason: reason || null,
    }),
    summary: `Leave request from ${resource.name}`,
  });

  await logInteraction({ ...base(user, context.activity.id), command: "leave", inputText: `${startRaw} ${endRaw ?? ""}`, outcome: "ok" });
}

async function currentWindow(companyId: string) {
  return prisma.statusWindow.findFirst({
    where: { companyId },
    orderBy: { date: "desc" },
    include: {
      requests: { include: { resource: true, dailyStatus: true } },
    },
  });
}

async function showStandup(context: TurnContext, user: BotUser): Promise<void> {
  if (!user.isLead) {
    await context.sendActivity("Standup summaries are for project managers and above.");
    return;
  }

  const window = await currentWindow(user.companyId);
  if (!window) {
    await context.sendActivity("No status window has run yet.");
    return;
  }

  const expected = window.requests.filter((r) => r.state !== "skipped_leave");
  const submitted = expected.filter((r) => r.state === "submitted");
  const productiveHours = submitted.reduce((sum, r) => sum + (r.dailyStatus?.productiveHours ?? 0), 0);
  const blockers = submitted
    .filter((r) => r.dailyStatus?.blockers?.trim())
    .map((r) => ({ name: r.resource.name, text: r.dailyStatus!.blockers!.trim() }));
  const missing = expected.filter((r) => r.state !== "submitted").map((r) => r.resource.name);

  const metrics = {
    submitted: submitted.length,
    expected: expected.length,
    productiveHours,
    blockers: blockers.length,
    missing: missing.length,
  };

  await reply(
    context,
    standupCard({
      dateLabel: format(window.date, "yyyy-MM-dd"),
      submitted: submitted.length,
      expected: expected.length,
      productiveHours,
      blockers,
      missing,
      narrative: await summarizeForLead(`Standup ${format(window.date, "yyyy-MM-dd")}`, metrics),
    }),
  );
  await logInteraction({ ...base(user, context.activity.id), command: "standup", outcome: "ok" });
}

async function showMissing(context: TurnContext, user: BotUser): Promise<void> {
  if (!user.isLead) {
    await context.sendActivity("That one is for project managers and above.");
    return;
  }

  const window = await currentWindow(user.companyId);
  if (!window) {
    await context.sendActivity("No status window has run yet.");
    return;
  }

  const pending = window.requests
    .filter((r) => r.state === "pending" || r.state === "expired")
    .map((r) => ({ name: r.resource.name, email: r.resource.email }));

  await reply(
    context,
    missingNowCard({
      dateLabel: format(window.date, "yyyy-MM-dd"),
      expiresLabel: format(window.expiresAt, "PPpp"),
      pending,
      windowId: window.id,
    }),
  );
}

async function showProjectReport(
  context: TurnContext,
  user: BotUser,
  nameOrCode: string,
): Promise<void> {
  if (!user.isLead) {
    await context.sendActivity("Project reports are for project managers and above.");
    return;
  }

  const project = await prisma.project.findFirst({
    where: {
      account: { companyId: user.companyId },
      OR: [
        { name: { contains: nameOrCode, mode: "insensitive" } },
        { code: { contains: nameOrCode, mode: "insensitive" } },
      ],
    },
    include: { tasks: true, defects: true, testCases: true, assignments: true },
  });

  if (!project) {
    await context.sendActivity(`I couldn't find a project matching "${nameOrCode}".`);
    return;
  }

  const now = new Date();
  const statuses = await prisma.dailyStatus.findMany({
    where: { projectId: project.id, date: { gte: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)) } },
  });

  const overdueTasks = project.tasks.filter(
    (t) =>
      t.status !== "done" &&
      ((t.clientDeadline && t.clientDeadline < now) || (t.resourceDeadline && t.resourceDeadline < now)),
  ).length;
  const openDefects = project.defects.filter((d) => d.status !== "closed").length;

  const metrics = {
    productiveHours: statuses.reduce((sum, s) => sum + s.productiveHours, 0),
    overdueTasks,
    openDefects,
    testPassRate:
      project.testCases.length === 0
        ? null
        : Math.round(
            (project.testCases.filter((t) => t.status === "pass").length / project.testCases.length) * 100,
          ),
    resources: project.assignments.length,
    rag:
      overdueTasks > 0
        ? "Red"
        : project.defects.some((d) => d.severity === "critical" && d.status !== "closed")
          ? "Amber"
          : "Green",
  };

  const narrative =
    (await summarizeForLead(`Project ${project.name}`, metrics)) ??
    `${project.name}: ${metrics.overdueTasks} overdue task(s), ${metrics.openDefects} open defect(s), status ${metrics.rag}.`;

  await reply(
    context,
    weeklyDigestCard({
      title: `Project status — ${project.name} [${metrics.rag}]`,
      narrative,
      metrics,
      reportsUrl: `${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/dashboard/projects/${project.id}`,
    }),
  );
}

async function handleFreeText(context: TurnContext, user: BotUser, text: string): Promise<void> {
  const resourceId = await requireResource(context, user);
  if (!resourceId) return;

  const status = await getStatusContext(user.companyId, resourceId);
  if (!status.ok) {
    await context.sendActivity(
      `${STATUS_BLOCKED_MESSAGE[status.reason]} Say **help** to see what else I can do.`,
    );
    return;
  }

  if (!isAiParseEnabled()) {
    await context.sendActivity("Here's today's form — fill it in and hit submit.");
    await reply(context, dailyStatusCard(status.context));
    return;
  }

  const parsed = await parseStatusUpdate(text, status.context.tasks);
  if (!parsed.ok) {
    await logInteraction({
      ...base(user, context.activity.id),
      command: "free_text",
      inputText: text,
      outcome: "rejected",
      errorMessage: parsed.reason,
    });
    await context.sendActivity("I couldn't read that as a status update, so here's the form instead.");
    await reply(context, dailyStatusCard(status.context));
    return;
  }

  await logInteraction({
    ...base(user, context.activity.id),
    command: "free_text",
    inputText: text,
    parsedJson: JSON.stringify(parsed.parsed),
    outcome: "ok",
  });
  await reply(context, parsePreviewCard(parsed.parsed, status.context.tasks));
}

// ---------------------------------------------------------------------------
// Adaptive Card actions
// ---------------------------------------------------------------------------

function statusInputFromCard(value: Record<string, unknown>): StatusInput {
  const items: StatusInput["items"] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (!key.startsWith("task_")) continue;
    const progress = Number(raw);
    if (Number.isNaN(progress)) continue;
    items.push({ taskId: key.slice("task_".length), hours: 0, progressPct: progress });
  }

  return statusInputSchema.parse({
    productiveHours: value.productiveHours ?? 0,
    nonProductiveHours: value.nonProductiveHours ?? 0,
    narrative: typeof value.narrative === "string" ? value.narrative : undefined,
    blockers: typeof value.blockers === "string" && value.blockers.trim() ? value.blockers : undefined,
    progressPct: value.progressPct == null || value.progressPct === "" ? undefined : value.progressPct,
    projectId: typeof value.projectId === "string" && value.projectId ? value.projectId : undefined,
    items,
  });
}

async function handleCardAction(
  context: TurnContext,
  user: BotUser,
  value: Record<string, unknown>,
): Promise<void> {
  const action = String(value.action);

  switch (action) {
    case "status_open":
      await openStatusForm(context, user);
      return;

    case "status_submit": {
      const resourceId = await requireResource(context, user);
      if (!resourceId) return;
      let data: StatusInput;
      try {
        data = statusInputFromCard(value);
      } catch (error) {
        await context.sendActivity("Some of those numbers didn't look right. Hours must be 0-24 and percentages 0-100.");
        await logInteraction({
          ...base(user, context.activity.id),
          command: "status_submit",
          outcome: "error",
          errorMessage: String(error),
        });
        return;
      }
      await saveStatus(context, user, resourceId, data, "status_submit");
      return;
    }

    case "parse_confirm": {
      const resourceId = await requireResource(context, user);
      if (!resourceId) return;
      try {
        const data = statusInputSchema.parse(JSON.parse(String(value.parsed)));
        await saveStatus(context, user, resourceId, data, "parse_confirm");
      } catch (error) {
        await context.sendActivity("That preview expired. Say **status** to open the form.");
        await logInteraction({
          ...base(user, context.activity.id),
          command: "parse_confirm",
          outcome: "error",
          errorMessage: String(error),
        });
      }
      return;
    }

    case "task_progress": {
      const resourceId = await requireResource(context, user);
      if (!resourceId) return;
      const taskId = typeof value.taskId === "string" ? value.taskId : "";
      const progressPct = Number(value.progressPct);
      if (!taskId || Number.isNaN(progressPct)) {
        await context.sendActivity("Pick a task and a progress percentage first.");
        return;
      }
      const task = await prisma.task.findFirst({
        where: { id: taskId, project: { account: { companyId: user.companyId } } },
        select: { id: true, title: true, displayId: true },
      });
      if (!task) {
        await context.sendActivity("That task is no longer available.");
        return;
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { progressPct, status: progressPct >= 100 ? "done" : "in_progress" },
      });
      await context.sendActivity(
        `Updated **${task.displayId ? `${task.displayId} · ${task.title}` : task.title}** to ${progressPct}%.`,
      );
      return;
    }

    case "link_confirm": {
      // Card data is user-controlled, so re-derive the candidate from the Teams email.
      const candidate = await findLinkCandidate(user.companyId, user.identity.upn);
      if (!candidate || candidate.resourceId !== value.resourceId) {
        await context.sendActivity("I can't confirm that link. Ask an admin to link you under Dashboard → MS Teams.");
        await logInteraction({
          ...base(user, context.activity.id),
          command: "link_confirm",
          outcome: "rejected",
        });
        return;
      }
      await linkIdentityToResource(user.identity.id, candidate.resourceId);
      await context.sendActivity(
        `Linked you to **${candidate.resourceName}**. Say **status** to submit today's update.`,
      );
      await logInteraction({ ...base(user, context.activity.id), command: "link_confirm", outcome: "ok" });
      return;
    }

    case "link_reject":
      await context.sendActivity("No problem — an admin can link the right person under Dashboard → MS Teams.");
      return;

    case "nudge_missing": {
      if (!user.isLead) {
        await context.sendActivity("Only project managers and above can nudge.");
        return;
      }
      const windowId = String(value.windowId ?? "");
      const window = await prisma.statusWindow.findFirst({
        where: { id: windowId, companyId: user.companyId },
      });
      if (!window) {
        await context.sendActivity("That status window is gone.");
        return;
      }
      const { sent } = await nudgePendingInWindow(user.companyId, windowId);
      await context.sendActivity(sent > 0 ? `Nudged ${sent} person(s).` : "Nobody left to nudge on Teams.");
      return;
    }

    case "leave_approve":
    case "leave_reject": {
      if (!user.isLead) {
        await context.sendActivity("Only project managers and above can decide leave.");
        return;
      }
      const leaveId = String(value.leaveId ?? "");
      const leave = await prisma.leave.findFirst({
        where: { id: leaveId, resource: { companyId: user.companyId } },
        include: { resource: true },
      });
      if (!leave) {
        await context.sendActivity("That leave request no longer exists.");
        return;
      }
      const status = action === "leave_approve" ? "approved" : "rejected";
      await prisma.leave.update({ where: { id: leave.id }, data: { status } });
      await context.sendActivity(`Leave for ${leave.resource.name} ${status}.`);

      const target = await identityTargetForResource(user.companyId, leave.resourceId);
      if (target) {
        await sendTeamsMessage({
          companyId: user.companyId,
          type: "leave_decision",
          dedupeKey: `leave_decision:${leave.id}:${status}`,
          targets: [target],
          text: `Your leave request for ${format(leave.startDate, "yyyy-MM-dd")} → ${format(leave.endDate, "yyyy-MM-dd")} was ${status}.`,
        });
      }
      return;
    }

    default:
      await context.sendActivity("I don't know that action. Say **help** for what I can do.");
  }
}

async function saveStatus(
  context: TurnContext,
  user: BotUser,
  resourceId: string,
  data: StatusInput,
  command: string,
): Promise<void> {
  const result = await writeDailyStatusForResource({
    companyId: user.companyId,
    resourceId,
    data,
  });

  if (!result.ok) {
    await context.sendActivity(STATUS_BLOCKED_MESSAGE[result.reason]);
    await logInteraction({
      ...base(user, context.activity.id),
      command,
      outcome: "rejected",
      errorMessage: result.reason,
    });
    return;
  }

  await reply(
    context,
    statusSavedCard({
      isUpdate: result.isUpdate,
      productiveHours: data.productiveHours,
      nonProductiveHours: data.nonProductiveHours,
      blockers: data.blockers,
    }),
  );

  // Announce immediately using the same dedupe key the relay would use, so the
  // scheduled run does not repeat it.
  await announceStatus(user.companyId, result.statusId);
  await logInteraction({
    ...base(user, context.activity.id),
    command,
    parsedJson: JSON.stringify(data),
    outcome: "ok",
  });
}
