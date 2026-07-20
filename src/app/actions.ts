"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import { assertDeliveryEdit, assertFeature, assertSession } from "@/lib/assert-feature";
import type { DefectSource, DefectSeverity, LeaveType, ProjectPhase, TestCaseStatus } from "@/generated/prisma/client";

async function companyId() {
  const session = await assertSession();
  return session.user.companyId;
}

export async function createAccount(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const technology = String(formData.get("technology") ?? "").trim() || null;
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const projectManagers = String(formData.get("projectManagers") ?? "").trim() || null;
  if (!name) throw new Error("Name required");
  await prisma.account.create({
    data: { companyId: cid, name, code, technology, domain, projectManagers },
  });
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/gts-report");
}

export async function updateAccount(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const accountId = String(formData.get("accountId"));
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim() || null;
  const technology = String(formData.get("technology") ?? "").trim() || null;
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const projectManagers = String(formData.get("projectManagers") ?? "").trim() || null;
  const active = String(formData.get("active") ?? "yes") === "yes";
  if (!name) throw new Error("Name required");
  const updated = await prisma.account.updateMany({
    where: { id: accountId, companyId: cid },
    data: { name, code, technology, domain, projectManagers, active },
  });
  if (!updated.count) throw new Error("Account not found");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/gts-report");
}

export async function deleteAccount(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const accountId = String(formData.get("accountId"));
  const updated = await prisma.account.updateMany({
    where: { id: accountId, companyId: cid },
    data: { active: false },
  });
  if (!updated.count) throw new Error("Account not found");
  revalidatePath("/dashboard/accounts");
  revalidatePath("/dashboard/projects");
}

export async function createProject(formData: FormData) {
  await assertDeliveryEdit();
  await companyId();
  const accountId = String(formData.get("accountId"));
  const name = String(formData.get("name") ?? "").trim();
  const phase = String(formData.get("phase") ?? "Requirements") as ProjectPhase;
  const billable = String(formData.get("billable") ?? "yes") === "yes";
  const startDate = String(formData.get("startDate") ?? "") || null;
  const endDate = String(formData.get("endDate") ?? "") || null;
  if (!accountId || !name) throw new Error("Missing fields");
  await prisma.project.create({
    data: {
      accountId,
      name,
      phase,
      billable,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  revalidatePath("/dashboard/projects");
}

export async function updateProject(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const projectId = String(formData.get("projectId"));
  const name = String(formData.get("name") ?? "").trim();
  const phase = String(formData.get("phase") ?? "Dev") as ProjectPhase;
  const billable = String(formData.get("billable") ?? "yes") === "yes";
  const active = String(formData.get("active") ?? "yes") === "yes";
  const startDate = String(formData.get("startDate") ?? "") || null;
  const endDate = String(formData.get("endDate") ?? "") || null;
  if (!name) throw new Error("Name required");
  const project = await prisma.project.findFirst({
    where: { id: projectId, account: { companyId: cid } },
  });
  if (!project) throw new Error("Project not found");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      phase,
      billable,
      active,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/backlog");
}

export async function deleteProject(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({
    where: { id: projectId, account: { companyId: cid } },
  });
  if (!project) throw new Error("Project not found");
  await prisma.project.update({
    where: { id: projectId },
    data: { active: false },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/backlog");
}

export async function updateProjectBilling(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const projectId = String(formData.get("projectId"));
  const billable = String(formData.get("billable") ?? "yes") === "yes";
  const startDate = String(formData.get("startDate") ?? "") || null;
  const endDate = String(formData.get("endDate") ?? "") || null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, account: { companyId: cid } },
  });
  if (!project) throw new Error("Project not found");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      billable,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/billing");
}

export async function createResource(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const employeeId = String(formData.get("employeeId") ?? "").trim() || null;
  if (!name || !email) throw new Error("Missing fields");
  if (employeeId) {
    const dup = await prisma.resource.findFirst({
      where: { companyId: cid, employeeId },
    });
    if (dup) throw new Error("Employee ID already exists");
  }
  await prisma.resource.create({ data: { companyId: cid, name, email, employeeId } });
  revalidatePath("/dashboard/resources");
}

export async function updateResource(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const id = String(formData.get("resourceId"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const employeeId = String(formData.get("employeeId") ?? "").trim() || null;
  const activeRaw = formData.get("active");
  const active = activeRaw == null ? undefined : String(activeRaw) === "yes";
  if (employeeId) {
    const dup = await prisma.resource.findFirst({
      where: { companyId: cid, employeeId, NOT: { id } },
    });
    if (dup) throw new Error("Employee ID already exists");
  }
  await prisma.resource.updateMany({
    where: { id, companyId: cid },
    data: {
      name,
      email,
      employeeId,
      ...(active === undefined ? {} : { active }),
    },
  });
  revalidatePath("/dashboard/resources");
  revalidatePath("/dashboard/billing");
}

export async function deleteResource(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const id = String(formData.get("resourceId"));
  const updated = await prisma.resource.updateMany({
    where: { id, companyId: cid },
    data: { active: false },
  });
  if (!updated.count) throw new Error("Resource not found");
  await prisma.resourceAssignment.updateMany({
    where: { resourceId: id, project: { account: { companyId: cid } } },
    data: { active: false },
  });
  revalidatePath("/dashboard/resources");
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/billing");
}

export async function assignResource(formData: FormData) {
  await assertDeliveryEdit();
  await companyId();
  const projectId = String(formData.get("projectId"));
  const resourceId = String(formData.get("resourceId"));
  const capacityPct = Number(formData.get("capacityPct") ?? 100);
  const billable = String(formData.get("billable") ?? "yes") === "yes";
  const hourlyRate = billable ? Number(formData.get("hourlyRate") ?? 0) : 0;
  await prisma.resourceAssignment.upsert({
    where: { projectId_resourceId: { projectId, resourceId } },
    create: { projectId, resourceId, capacityPct, hourlyRate, billable },
    update: { capacityPct, hourlyRate, billable, active: true },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/resources");
  revalidatePath("/dashboard/billing");
}

export async function unassignResource(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const projectId = String(formData.get("projectId"));
  const resourceId = String(formData.get("resourceId"));
  const assignment = await prisma.resourceAssignment.findFirst({
    where: {
      projectId,
      resourceId,
      project: { account: { companyId: cid } },
    },
  });
  if (!assignment) throw new Error("Assignment not found");
  await prisma.resourceAssignment.update({
    where: { id: assignment.id },
    data: { active: false },
  });
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/resources");
  revalidatePath("/dashboard/billing");
}

function parseOptionalDate(formData: FormData, key: string): Date | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw ? new Date(raw) : null;
}

function parseEstimateDays(formData: FormData): number | null {
  const raw = String(formData.get("estimateDays") ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export async function createTask(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const { canEditAll, myResource } = await getProjectAccess(projectId);
  if (!canEditAll && !myResource) throw new Error("Unauthorized");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  let resourceId = String(formData.get("resourceId") ?? "") || null;
  if (!canEditAll && myResource) {
    resourceId = myResource.id;
  }
  const parentId = String(formData.get("parentId") ?? "") || null;
  const kind = (String(formData.get("kind") ?? "task") as "task" | "subtask") || "task";
  const phase = String(formData.get("phase") ?? "Dev") as ProjectPhase;
  const requirementId = String(formData.get("requirementId") ?? "") || null;
  const clientDeadline = parseOptionalDate(formData, "clientDeadline");
  const resourceDeadline = parseOptionalDate(formData, "resourceDeadline");
  const startDate = parseOptionalDate(formData, "startDate");
  const endDate = parseOptionalDate(formData, "endDate");
  const estimateDays = parseEstimateDays(formData);
  const progressPct = Number(formData.get("progressPct") ?? 0);
  const status = String(formData.get("status") ?? "todo") as
    | "todo"
    | "in_progress"
    | "blocked"
    | "done";

  await prisma.task.create({
    data: {
      projectId,
      title,
      description,
      resourceId,
      parentId: kind === "subtask" || parentId ? parentId : null,
      kind: parentId || kind === "subtask" ? "subtask" : "task",
      phase,
      requirementId,
      progressPct,
      status,
      estimateDays,
      estimateHours: estimateDays != null ? estimateDays * 8 : null,
      startDate,
      endDate,
      clientDeadline,
      resourceDeadline,
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
  revalidatePath("/dashboard/backlog");
}

export async function updateTask(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const taskId = String(formData.get("taskId"));
  const { canEditAll, myResource } = await getProjectAccess(projectId);

  const existing = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!existing) throw new Error("Task not found");

  if (!canEditAll) {
    if (!myResource || existing.resourceId !== myResource.id) {
      throw new Error("Unauthorized");
    }
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  let resourceId = String(formData.get("resourceId") ?? "") || null;
  if (!canEditAll && myResource) resourceId = myResource.id;

  const parentId = String(formData.get("parentId") ?? "") || null;
  const kind = (String(formData.get("kind") ?? existing.kind) as "task" | "subtask") || "task";
  const phase = String(formData.get("phase") ?? existing.phase) as ProjectPhase;
  const requirementId = String(formData.get("requirementId") ?? "") || null;
  const clientDeadline = parseOptionalDate(formData, "clientDeadline");
  const resourceDeadline = parseOptionalDate(formData, "resourceDeadline");
  const startDate = parseOptionalDate(formData, "startDate");
  const endDate = parseOptionalDate(formData, "endDate");
  const estimateDays = parseEstimateDays(formData);
  const progressPct = Number(formData.get("progressPct") ?? existing.progressPct);
  const status = String(formData.get("status") ?? existing.status) as
    | "todo"
    | "in_progress"
    | "blocked"
    | "done";

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title,
      description,
      resourceId,
      parentId: kind === "subtask" ? parentId : null,
      kind: kind === "subtask" || parentId ? "subtask" : "task",
      phase,
      requirementId,
      progressPct,
      status,
      estimateDays,
      estimateHours: estimateDays != null ? estimateDays * 8 : null,
      startDate,
      endDate,
      clientDeadline,
      resourceDeadline,
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
  revalidatePath("/dashboard/backlog");
}

export async function deleteTask(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const taskId = String(formData.get("taskId"));
  const { canEditAll, myResource } = await getProjectAccess(projectId);

  const existing = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    include: { children: true },
  });
  if (!existing) throw new Error("Task not found");

  if (!canEditAll) {
    if (!myResource || existing.resourceId !== myResource.id) {
      throw new Error("Unauthorized");
    }
  }

  // Delete subtasks first
  await prisma.task.deleteMany({ where: { parentId: taskId } });
  await prisma.task.delete({ where: { id: taskId } });

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
}

export async function createRequirement(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const { canEditAll } = await getProjectAccess(projectId);
  if (!canEditAll) throw new Error("Unauthorized — PM / delivery roles only");

  const title = String(formData.get("title") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const kind = String(formData.get("kind") ?? "story") as "epic" | "feature" | "story";
  const description = String(formData.get("description") ?? "") || null;
  const closed = String(formData.get("closed") ?? "") === "yes";
  const level = kind === "epic" ? 1 : kind === "feature" ? 2 : 3;
  await prisma.requirement.create({
    data: { projectId, title, parentId, kind, level, description, closed },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
}

export async function updateRequirement(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const requirementId = String(formData.get("requirementId"));
  const { canEditAll } = await getProjectAccess(projectId);
  if (!canEditAll) throw new Error("Unauthorized — PM / delivery roles only");

  const title = String(formData.get("title") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const kind = String(formData.get("kind") ?? "story") as "epic" | "feature" | "story";
  const description = String(formData.get("description") ?? "") || null;
  const closed = String(formData.get("closed") ?? "") === "yes";
  const level = kind === "epic" ? 1 : kind === "feature" ? 2 : 3;

  await prisma.requirement.update({
    where: { id: requirementId },
    data: { title, parentId, kind, level, description, closed },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
}

export async function deleteRequirement(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const requirementId = String(formData.get("requirementId"));
  const { canEditAll } = await getProjectAccess(projectId);
  if (!canEditAll) throw new Error("Unauthorized — PM / delivery roles only");

  // Unlink tasks, then delete children requirements recursively via parent clear + delete
  await prisma.task.updateMany({
    where: { requirementId },
    data: { requirementId: null },
  });
  await prisma.requirement.updateMany({
    where: { parentId: requirementId },
    data: { parentId: null },
  });
  await prisma.requirement.delete({ where: { id: requirementId } });

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/backlog`);
  revalidatePath("/dashboard/workboard");
}

export async function createTestCase(formData: FormData) {
  await assertDeliveryEdit();
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  const requirementId = String(formData.get("requirementId") ?? "") || null;
  const status = (String(formData.get("status") ?? "not_run") as TestCaseStatus) || "not_run";
  await prisma.testCase.create({ data: { projectId, title, requirementId, status } });
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function createDefect(formData: FormData) {
  await assertDeliveryEdit();
  const projectId = String(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  const source = String(formData.get("source") ?? "internal") as DefectSource;
  const severity = String(formData.get("severity") ?? "medium") as DefectSeverity;
  await prisma.defect.create({ data: { projectId, title, source, severity } });
  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function createRca(formData: FormData) {
  await assertDeliveryEdit();
  const defectId = String(formData.get("defectId"));
  const projectId = String(formData.get("projectId"));
  const problemStatement = String(formData.get("problemStatement") ?? "") || null;
  const rootCause = String(formData.get("rootCause") ?? "").trim();
  const contributingFactors = String(formData.get("contributingFactors") ?? "") || null;
  const impact = String(formData.get("impact") ?? "") || null;
  const containmentAction = String(formData.get("containmentAction") ?? "") || null;
  const correctiveAction = String(formData.get("correctiveAction") ?? "").trim();
  const preventiveAction = String(formData.get("preventiveAction") ?? "") || null;
  const owner = String(formData.get("owner") ?? "") || null;
  const targetDate = String(formData.get("targetDate") ?? "") || null;
  const status = String(formData.get("status") ?? "draft") as
    | "draft"
    | "in_progress"
    | "pending_review"
    | "closed";
  const reviewNotes = String(formData.get("reviewNotes") ?? "") || null;
  const reviewedBy = String(formData.get("reviewedBy") ?? "") || null;

  await prisma.rCA.upsert({
    where: { defectId },
    create: {
      defectId,
      problemStatement,
      rootCause,
      contributingFactors,
      impact,
      containmentAction,
      correctiveAction,
      preventiveAction,
      owner,
      targetDate: targetDate ? new Date(targetDate) : null,
      status,
      reviewNotes,
      reviewedBy,
      reviewedAt: reviewedBy ? new Date() : null,
    },
    update: {
      problemStatement,
      rootCause,
      contributingFactors,
      impact,
      containmentAction,
      correctiveAction,
      preventiveAction,
      owner,
      targetDate: targetDate ? new Date(targetDate) : null,
      status,
      reviewNotes,
      reviewedBy,
      reviewedAt: reviewedBy ? new Date() : null,
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/quality");
}

export async function createReviewSheet(formData: FormData) {
  await assertDeliveryEdit();
  const defectId = String(formData.get("defectId"));
  const projectId = String(formData.get("projectId"));
  const rca = await prisma.rCA.findUnique({ where: { defectId } });
  const reviewerName = String(formData.get("reviewerName") ?? "") || null;
  const reviewType = String(formData.get("reviewType") ?? "internal");
  const scopeSummary = String(formData.get("scopeSummary") ?? "") || null;
  const findings = String(formData.get("findings") ?? "") || null;
  const actionItems = String(formData.get("actionItems") ?? "") || null;
  const residualRisk = String(formData.get("residualRisk") ?? "") || null;
  const signOff = String(formData.get("signOff") ?? "") || null;
  const bool = (k: string) => formData.get(k) === "on" || formData.get(k) === "true";

  await prisma.reviewSheet.upsert({
    where: { defectId },
    create: {
      defectId,
      rcaId: rca?.id ?? null,
      reviewerName,
      reviewType,
      scopeSummary,
      codeReviewDone: bool("codeReviewDone"),
      testReviewDone: bool("testReviewDone"),
      documentationUpdated: bool("documentationUpdated"),
      clientCommunication: bool("clientCommunication"),
      regressionCovered: bool("regressionCovered"),
      findings,
      actionItems,
      residualRisk,
      signOff,
      signOffAt: signOff ? new Date() : null,
    },
    update: {
      rcaId: rca?.id ?? null,
      reviewerName,
      reviewType,
      scopeSummary,
      codeReviewDone: bool("codeReviewDone"),
      testReviewDone: bool("testReviewDone"),
      documentationUpdated: bool("documentationUpdated"),
      clientCommunication: bool("clientCommunication"),
      regressionCovered: bool("regressionCovered"),
      findings,
      actionItems,
      residualRisk,
      signOff,
      signOffAt: signOff ? new Date() : null,
    },
  });
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/quality");
}

export async function createLeave(formData: FormData) {
  await assertDeliveryEdit();
  const resourceId = String(formData.get("resourceId"));
  const projectId = String(formData.get("projectId") ?? "") || null;
  const type = String(formData.get("type") ?? "internal") as LeaveType;
  const startDate = new Date(String(formData.get("startDate")));
  const endDate = new Date(String(formData.get("endDate")));
  const reason = String(formData.get("reason") ?? "") || null;
  await prisma.leave.create({
    data: { resourceId, projectId, type, startDate, endDate, reason, status: "approved" },
  });
  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard/billing");
}

export async function createExtraWorkingDay(formData: FormData) {
  await assertDeliveryEdit();
  const resourceId = String(formData.get("resourceId"));
  const projectId = String(formData.get("projectId"));
  const raw = String(formData.get("date"));
  const date = new Date(`${raw}T00:00:00.000Z`);
  const note = String(formData.get("note") ?? "") || null;
  await prisma.extraWorkingDay.upsert({
    where: {
      resourceId_projectId_date: { resourceId, projectId, date },
    },
    create: { resourceId, projectId, date, note },
    update: { note },
  });
  revalidatePath("/dashboard/leaves");
  revalidatePath("/dashboard/billing");
}

export async function saveBillingMonthOverride(formData: FormData) {
  await assertDeliveryEdit();
  const cid = await companyId();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const totalWorkingDays = Number(formData.get("totalWorkingDays"));
  const note = String(formData.get("note") ?? "") || null;
  await prisma.billingMonthOverride.upsert({
    where: { companyId_year_month: { companyId: cid, year, month } },
    create: { companyId: cid, year, month, totalWorkingDays, note },
    update: { totalWorkingDays, note },
  });
  revalidatePath("/dashboard/billing");
}

export async function updateCompanySettings(formData: FormData) {
  await assertFeature("edit_settings");
  const cid = await companyId();
  await prisma.company.update({
    where: { id: cid },
    data: {
      statusWindowStart: String(formData.get("statusWindowStart") ?? "17:00"),
      statusWindowHours: Number(formData.get("statusWindowHours") ?? 2),
      timezone: String(formData.get("timezone") ?? "Asia/Kolkata"),
      weeklyReportTime: String(formData.get("weeklyReportTime") ?? "09:00"),
      deadlineWarnDays: String(formData.get("deadlineWarnDays") ?? "3,1"),
    },
  });
  revalidatePath("/dashboard/settings");
}

export async function triggerAgentJob(job: string) {
  const session = await assertFeature("run_agent");
  const { openDailyStatusWindow, closeExpiredStatusWindows, sweepDeadlines, generateWeeklyReports } =
    await import("@/lib/agent");
  switch (job) {
    case "open-status-window":
      return openDailyStatusWindow(session.user.companyId);
    case "close-status-window":
      return closeExpiredStatusWindows(session.user.companyId);
    case "deadline-sweep":
      return sweepDeadlines(session.user.companyId);
    case "weekly-reports":
      return generateWeeklyReports(session.user.companyId);
    default:
      throw new Error("Unknown job");
  }
}

export async function createUser(formData: FormData) {
  const session = await assertFeature("manage_users");
  const { ALL_ROLES } = await import("@/lib/roles");

  const bcrypt = (await import("bcryptjs")).default;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "Employee") as (typeof ALL_ROLES)[number];
  if (!name || !email || password.length < 6) throw new Error("Invalid user data");
  if (!ALL_ROLES.includes(role)) throw new Error("Invalid role");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      companyId: session.user.companyId,
      name,
      email,
      passwordHash,
      role,
    },
  });
  revalidatePath("/dashboard/users");
}

export async function updateUserRole(formData: FormData) {
  const session = await assertFeature("manage_users");
  const { ALL_ROLES } = await import("@/lib/roles");

  const userId = String(formData.get("userId"));
  const role = String(formData.get("role")) as (typeof ALL_ROLES)[number];
  if (!ALL_ROLES.includes(role)) throw new Error("Invalid role");

  await prisma.user.updateMany({
    where: { id: userId, companyId: session.user.companyId },
    data: { role },
  });
  revalidatePath("/dashboard/users");
}

export async function saveRoleFeatureMatrix(formData: FormData) {
  const session = await assertFeature("permissions");
  const { setRoleFeature, ensureDefaultRoleFeatures } = await import("@/lib/permissions");
  const rolesMod = await import("@/lib/roles");

  await ensureDefaultRoleFeatures(session.user.companyId);

  for (const role of rolesMod.ALL_ROLES) {
    // Company Admin access is always full — do not persist toggles that lock admin out.
    if (role === "CompanyAdmin") continue;
    for (const feature of rolesMod.FEATURE_CATALOG) {
      const name = `perm__${role}__${feature.key}`;
      const enabled = formData.get(name) === "on";
      await setRoleFeature(session.user.companyId, role, feature.key, enabled);
    }
  }

  revalidatePath("/dashboard/permissions");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/users");
}

function revalidateGts() {
  revalidatePath("/dashboard/gts-report");
}

/** Create or refresh a month GTS report from live status/billing/defect data. */
export async function generateGtsMonthReport(formData: FormData) {
  const session = await assertFeature("gts_report");
  await assertDeliveryEdit();
  const cid = session.user.companyId;
  const accountId = String(formData.get("accountId"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const replaceLines = String(formData.get("replaceLines") ?? "yes") === "yes";
  if (!accountId || !year || !month) throw new Error("Account, year, and month required");

  const { buildGtsMonthDraft } = await import("@/lib/gts-report");
  const draft = await buildGtsMonthDraft({ companyId: cid, accountId, year, month });

  const report = await prisma.gtsMonthlyReport.upsert({
    where: { accountId_year_month: { accountId, year, month } },
    create: {
      companyId: cid,
      accountId,
      year,
      month,
      projectName: draft.projectName,
      projectManagers: draft.projectManagers,
      technology: draft.technology,
      domain: draft.domain,
      utilizationPct: draft.utilizationPct,
      availabilityPct: draft.availabilityPct,
    },
    update: {
      utilizationPct: draft.utilizationPct,
      availabilityPct: draft.availabilityPct,
      projectName: draft.projectName,
      projectManagers: draft.projectManagers,
      technology: draft.technology,
      domain: draft.domain,
    },
  });

  if (replaceLines) {
    await prisma.gtsMonthlyLine.deleteMany({ where: { reportId: report.id } });
    if (draft.lines.length) {
      await prisma.gtsMonthlyLine.createMany({
        data: draft.lines.map((l, i) => ({
          reportId: report.id,
          projectId: l.projectId,
          sortOrder: i + 1,
          subProjectName: l.subProjectName,
          featureName: l.featureName,
          uatDefects: l.uatDefects,
          actualEffortHrs: l.actualEffortHrs,
          remarks: l.remarks,
        })),
      });
    }
  }

  revalidateGts();
}

export async function updateGtsMonthHeader(formData: FormData) {
  await assertFeature("gts_report");
  await assertDeliveryEdit();
  const cid = await companyId();
  const reportId = String(formData.get("reportId"));
  const report = await prisma.gtsMonthlyReport.findFirst({
    where: { id: reportId, companyId: cid },
  });
  if (!report) throw new Error("Report not found");

  await prisma.gtsMonthlyReport.update({
    where: { id: reportId },
    data: {
      projectName: String(formData.get("projectName") ?? "").trim() || null,
      projectManagers: String(formData.get("projectManagers") ?? "").trim() || null,
      technology: String(formData.get("technology") ?? "").trim() || null,
      domain: String(formData.get("domain") ?? "").trim() || null,
      utilizationPct: Number(formData.get("utilizationPct") || 0),
      availabilityPct: Number(formData.get("availabilityPct") || 0),
      remarks: String(formData.get("remarks") ?? "").trim() || null,
    },
  });
  revalidateGts();
}

export async function upsertGtsMonthLine(formData: FormData) {
  await assertFeature("gts_report");
  await assertDeliveryEdit();
  const cid = await companyId();
  const reportId = String(formData.get("reportId"));
  const lineId = String(formData.get("lineId") ?? "") || null;
  const report = await prisma.gtsMonthlyReport.findFirst({
    where: { id: reportId, companyId: cid },
  });
  if (!report) throw new Error("Report not found");

  const data = {
    projectId: String(formData.get("projectId") ?? "") || null,
    subProjectName: String(formData.get("subProjectName") ?? "").trim(),
    featureName: String(formData.get("featureName") ?? "").trim(),
    uatDefects: Number(formData.get("uatDefects") ?? 0),
    actualEffortHrs: Number(formData.get("actualEffortHrs") ?? 0),
    remarks: String(formData.get("remarks") ?? "").trim() || null,
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  };
  if (!data.subProjectName) throw new Error("Sub project name required");

  if (lineId) {
    await prisma.gtsMonthlyLine.updateMany({
      where: { id: lineId, reportId },
      data,
    });
  } else {
    const max = await prisma.gtsMonthlyLine.aggregate({
      where: { reportId },
      _max: { sortOrder: true },
    });
    await prisma.gtsMonthlyLine.create({
      data: {
        reportId,
        ...data,
        sortOrder: data.sortOrder || (max._max.sortOrder ?? 0) + 1,
      },
    });
  }
  revalidateGts();
}

export async function deleteGtsMonthLine(formData: FormData) {
  await assertFeature("gts_report");
  await assertDeliveryEdit();
  const cid = await companyId();
  const lineId = String(formData.get("lineId"));
  const line = await prisma.gtsMonthlyLine.findFirst({
    where: { id: lineId, report: { companyId: cid } },
  });
  if (!line) throw new Error("Line not found");
  await prisma.gtsMonthlyLine.delete({ where: { id: lineId } });
  revalidateGts();
}
