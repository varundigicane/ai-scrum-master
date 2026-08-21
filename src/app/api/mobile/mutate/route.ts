import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { hasFeature, setRoleFeature } from "@/lib/permissions";
import { cacheInvalidatePrefix } from "@/lib/memory-cache";
import { allocateDisplayId } from "@/lib/work-item-id";
import bcrypt from "bcryptjs";
import type { FeatureKey } from "@/lib/roles";
import { ALL_ROLES, FEATURE_CATALOG } from "@/lib/roles";
import type {
  LeaveType,
  Role,
  ProjectPhase,
  RequirementKind,
  TaskKind,
  TaskStatus,
  DefectSeverity,
  DefectSource,
  DefectStatus,
  RcaStatus,
} from "@/generated/prisma/enums";

type Body = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").trim();
const optDate = (v: unknown) => {
  const raw = s(v);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
const bad = (msg: string, code = 400) => NextResponse.json({ error: msg }, { status: code });
const FEATURE_KEYS = new Set(FEATURE_CATALOG.map((f) => f.key));

/**
 * Unified mobile write API for catalog menus.
 * POST body: { menu, action, ...fields }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const menu = String(body.menu ?? "") as FeatureKey;
    const action = String(body.action ?? "create");
    if (!menu) return bad("menu required");

    const payload = await requireMobileFeature(req, menu);
    const companyId = payload.companyId;
    const role = payload.role;
    const bump = () => cacheInvalidatePrefix(`${companyId}:`);
    const can = (f: FeatureKey) => hasFeature(companyId, role, f);

    // Helper: ensure a project belongs to this company.
    const ownProject = (projectId: string) =>
      prisma.project.findFirst({ where: { id: projectId, account: { companyId } } });

    // ---------------- accounts ----------------
    if (menu === "accounts") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);
      if (action === "create") {
        const name = s(body.name);
        if (!name) return bad("Name required.");
        const row = await prisma.account.create({
          data: {
            companyId,
            name,
            code: s(body.code) || null,
            technology: s(body.technology) || null,
            domain: s(body.domain) || null,
            projectManagers: s(body.projectManagers) || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Account created." });
      }
      if (action === "update") {
        const id = s(body.id);
        const existing = await prisma.account.findFirst({ where: { id, companyId } });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.account.update({
          where: { id },
          data: {
            name: body.name !== undefined ? s(body.name) || existing.name : existing.name,
            code: body.code !== undefined ? s(body.code) || null : existing.code,
            technology: body.technology !== undefined ? s(body.technology) || null : existing.technology,
            domain: body.domain !== undefined ? s(body.domain) || null : existing.domain,
            projectManagers:
              body.projectManagers !== undefined ? s(body.projectManagers) || null : existing.projectManagers,
            active: body.active === false ? false : body.active === true ? true : existing.active,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Account updated." });
      }
      if (action === "delete") {
        const id = s(body.id);
        const existing = await prisma.account.findFirst({ where: { id, companyId } });
        if (!existing) return bad("Not found.", 404);
        await prisma.account.update({ where: { id }, data: { active: false } });
        bump();
        return NextResponse.json({ message: "Account deactivated." });
      }
    }

    // ---------------- projects ----------------
    if (menu === "projects") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);
      if (action === "create") {
        const accountId = s(body.accountId);
        const name = s(body.name);
        if (!accountId || !name) return bad("Account and name required.");
        const account = await prisma.account.findFirst({ where: { id: accountId, companyId } });
        if (!account) return bad("Account not found.", 404);
        const row = await prisma.project.create({
          data: {
            accountId,
            name,
            phase: (s(body.phase) || "Requirements") as ProjectPhase,
            billable: body.billable !== false,
            startDate: optDate(body.startDate),
            endDate: optDate(body.endDate),
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Project created." });
      }
      if (action === "update") {
        const id = s(body.id);
        const existing = await ownProject(id);
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.project.update({
          where: { id },
          data: {
            name: body.name !== undefined ? s(body.name) || existing.name : existing.name,
            phase: body.phase !== undefined ? (s(body.phase) as ProjectPhase) : existing.phase,
            billable: body.billable === false ? false : body.billable === true ? true : existing.billable,
            startDate: body.startDate !== undefined ? optDate(body.startDate) : existing.startDate,
            endDate: body.endDate !== undefined ? optDate(body.endDate) : existing.endDate,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Project updated." });
      }
      if (action === "delete") {
        const id = s(body.id);
        const existing = await ownProject(id);
        if (!existing) return bad("Not found.", 404);
        await prisma.project.update({ where: { id }, data: { active: false } });
        bump();
        return NextResponse.json({ message: "Project deactivated." });
      }
      if (action === "assign") {
        const projectId = s(body.projectId);
        const resourceId = s(body.resourceId);
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        const billable = body.billable !== false;
        const row = await prisma.resourceAssignment.upsert({
          where: { projectId_resourceId: { projectId, resourceId } },
          create: {
            projectId,
            resourceId,
            capacityPct: Number(body.capacityPct ?? 100) || 100,
            hourlyRate: billable ? Number(body.hourlyRate ?? 0) || 0 : 0,
            billable,
          },
          update: {
            capacityPct: Number(body.capacityPct ?? 100) || 100,
            hourlyRate: billable ? Number(body.hourlyRate ?? 0) || 0 : 0,
            billable,
            active: true,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Resource assigned." });
      }
      if (action === "unassign") {
        const projectId = s(body.projectId);
        const resourceId = s(body.resourceId);
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        await prisma.resourceAssignment
          .update({
            where: { projectId_resourceId: { projectId, resourceId } },
            data: { active: false },
          })
          .catch(() => null);
        bump();
        return NextResponse.json({ message: "Resource unassigned." });
      }
    }

    // ---------------- backlog (requirements + tasks) ----------------
    if (menu === "backlog") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);

      if (action === "createRequirement") {
        const projectId = s(body.projectId);
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        const title = s(body.title);
        if (!title) return bad("Title required.");
        const kind = (s(body.kind) || "story") as RequirementKind;
        const level = kind === "epic" ? 1 : kind === "feature" ? 2 : 3;
        const row = await prisma.$transaction(async (tx) => {
          const displayId = await allocateDisplayId(tx, projectId);
          return tx.requirement.create({
            data: {
              projectId,
              displayId,
              title,
              parentId: s(body.parentId) || null,
              kind,
              level,
              description: s(body.description) || null,
              closed: body.closed === true,
            },
          });
        });
        bump();
        return NextResponse.json({ item: row, message: "Requirement created." });
      }
      if (action === "updateRequirement") {
        const id = s(body.id);
        const existing = await prisma.requirement.findFirst({
          where: { id, project: { account: { companyId } } },
        });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.requirement.update({
          where: { id },
          data: {
            title: body.title !== undefined ? s(body.title) || existing.title : existing.title,
            description: body.description !== undefined ? s(body.description) || null : existing.description,
            closed: body.closed === true ? true : body.closed === false ? false : existing.closed,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Requirement updated." });
      }
      if (action === "deleteRequirement") {
        const id = s(body.id);
        const existing = await prisma.requirement.findFirst({
          where: { id, project: { account: { companyId } } },
        });
        if (!existing) return bad("Not found.", 404);
        await prisma.requirement.delete({ where: { id } });
        bump();
        return NextResponse.json({ message: "Requirement deleted." });
      }
      if (action === "createTask") {
        const projectId = s(body.projectId);
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        const title = s(body.title);
        if (!title) return bad("Title required.");
        const row = await prisma.$transaction(async (tx) => {
          const displayId = await allocateDisplayId(tx, projectId);
          return tx.task.create({
            data: {
              projectId,
              displayId,
              title,
              description: s(body.description) || null,
              resourceId: s(body.resourceId) || null,
              parentId: s(body.parentId) || null,
              kind: (s(body.kind) || "task") as TaskKind,
              phase: (s(body.phase) || "Dev") as ProjectPhase,
              status: (s(body.status) || "todo") as TaskStatus,
              requirementId: s(body.requirementId) || null,
              startDate: optDate(body.startDate),
              endDate: optDate(body.endDate),
              clientDeadline: optDate(body.clientDeadline),
              resourceDeadline: optDate(body.resourceDeadline),
            },
          });
        });
        bump();
        return NextResponse.json({ item: row, message: "Task created." });
      }
      if (action === "updateTask") {
        const id = s(body.id);
        const existing = await prisma.task.findFirst({
          where: { id, project: { account: { companyId } } },
        });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.task.update({
          where: { id },
          data: {
            title: body.title !== undefined ? s(body.title) || existing.title : existing.title,
            description: body.description !== undefined ? s(body.description) || null : existing.description,
            status: body.status !== undefined ? (s(body.status) as TaskStatus) : existing.status,
            progressPct:
              body.progressPct !== undefined ? Number(body.progressPct) || 0 : existing.progressPct,
            resourceId: body.resourceId !== undefined ? s(body.resourceId) || null : existing.resourceId,
            phase: body.phase !== undefined ? (s(body.phase) as ProjectPhase) : existing.phase,
            clientDeadline:
              body.clientDeadline !== undefined ? optDate(body.clientDeadline) : existing.clientDeadline,
            resourceDeadline:
              body.resourceDeadline !== undefined ? optDate(body.resourceDeadline) : existing.resourceDeadline,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Task updated." });
      }
      if (action === "deleteTask") {
        const id = s(body.id);
        const existing = await prisma.task.findFirst({
          where: { id, project: { account: { companyId } } },
        });
        if (!existing) return bad("Not found.", 404);
        await prisma.task.delete({ where: { id } });
        bump();
        return NextResponse.json({ message: "Task deleted." });
      }
    }

    // ---------------- resources ----------------
    if (menu === "resources") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);
      if (action === "create") {
        const name = s(body.name);
        const email = s(body.email);
        if (!name || !email) return bad("Name and email required.");
        const row = await prisma.resource.create({
          data: { companyId, name, email, employeeId: s(body.employeeId) || null },
        });
        bump();
        return NextResponse.json({ item: row, message: "Resource created." });
      }
      if (action === "update") {
        const id = s(body.id);
        const existing = await prisma.resource.findFirst({ where: { id, companyId } });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.resource.update({
          where: { id },
          data: {
            name: body.name !== undefined ? s(body.name) || existing.name : existing.name,
            email: body.email !== undefined ? s(body.email) || existing.email : existing.email,
            employeeId: body.employeeId !== undefined ? s(body.employeeId) || null : existing.employeeId,
            active: body.active === false ? false : body.active === true ? true : existing.active,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Resource updated." });
      }
      if (action === "delete") {
        const id = s(body.id);
        const existing = await prisma.resource.findFirst({ where: { id, companyId } });
        if (!existing) return bad("Not found.", 404);
        await prisma.resource.update({ where: { id }, data: { active: false } });
        bump();
        return NextResponse.json({ message: "Resource deactivated." });
      }
    }

    // ---------------- users ----------------
    if (menu === "users") {
      if (!(await can("manage_users"))) return bad("No manage users permission.", 403);
      if (action === "create") {
        const email = s(body.email).toLowerCase();
        const name = s(body.name);
        const password = String(body.password ?? "");
        const userRole = (s(body.role) || "Employee") as Role;
        if (!email || !name || password.length < 6) return bad("Name, email, and password (6+) required.");
        if (!ALL_ROLES.includes(userRole)) return bad("Invalid role.");
        const passwordHash = await bcrypt.hash(password, 10);
        const row = await prisma.user.create({ data: { companyId, email, name, passwordHash, role: userRole } });
        bump();
        return NextResponse.json({
          item: { id: row.id, email: row.email, name: row.name, role: row.role },
          message: "User created.",
        });
      }
      if (action === "updateRole") {
        const id = s(body.id);
        const userRole = s(body.role) as Role;
        if (!ALL_ROLES.includes(userRole)) return bad("Invalid role.");
        const existing = await prisma.user.findFirst({ where: { id, companyId } });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.user.update({ where: { id }, data: { role: userRole } });
        bump();
        return NextResponse.json({ item: { id: row.id, role: row.role }, message: "Role updated." });
      }
    }

    // ---------------- permissions ----------------
    if (menu === "permissions") {
      if (!(await can("permissions"))) return bad("No permission to edit access.", 403);
      if (action === "setRole") {
        const targetRole = s(body.role) as Role;
        const feature = s(body.feature) as FeatureKey;
        if (!ALL_ROLES.includes(targetRole)) return bad("Invalid role.");
        if (!FEATURE_KEYS.has(feature)) return bad("Invalid feature.");
        await setRoleFeature(companyId, targetRole, feature, body.enabled === true);
        bump();
        return NextResponse.json({ message: "Feature access updated." });
      }
    }

    // ---------------- leaves + extra working days ----------------
    if (menu === "leaves") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);
      if (action === "create") {
        const resourceId = s(body.resourceId);
        const startDate = optDate(body.startDate);
        const endDate = optDate(body.endDate);
        if (!resourceId || !startDate || !endDate) return bad("Resource and dates required.");
        const resource = await prisma.resource.findFirst({ where: { id: resourceId, companyId } });
        if (!resource) return bad("Resource not found.", 404);
        const row = await prisma.leave.create({
          data: {
            resourceId,
            startDate,
            endDate,
            type: (s(body.type) || "internal") as LeaveType,
            reason: s(body.reason) || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Leave created." });
      }
      if (action === "delete") {
        const id = s(body.id);
        const existing = await prisma.leave.findFirst({ where: { id, resource: { companyId } } });
        if (!existing) return bad("Not found.", 404);
        await prisma.leave.delete({ where: { id } });
        bump();
        return NextResponse.json({ message: "Leave deleted." });
      }
      if (action === "extraDay") {
        const resourceId = s(body.resourceId);
        const projectId = s(body.projectId);
        const date = optDate(body.date);
        if (!resourceId || !projectId || !date) return bad("Resource, project and date required.");
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        const row = await prisma.extraWorkingDay.upsert({
          where: { resourceId_projectId_date: { resourceId, projectId, date } },
          create: { resourceId, projectId, date, note: s(body.note) || null },
          update: { note: s(body.note) || null },
        });
        bump();
        return NextResponse.json({ item: row, message: "Extra working day saved." });
      }
    }

    // ---------------- quality (defects + RCA + review) ----------------
    if (menu === "quality") {
      if (!(await can("edit_delivery"))) return bad("No edit permission.", 403);
      if (action === "create") {
        const projectId = s(body.projectId);
        const title = s(body.title);
        if (!projectId || !title) return bad("Project and title required.");
        if (!(await ownProject(projectId))) return bad("Project not found.", 404);
        const row = await prisma.defect.create({
          data: {
            projectId,
            title,
            description: s(body.description) || null,
            severity: (s(body.severity) || "medium") as DefectSeverity,
            source: (s(body.source) || "internal") as DefectSource,
            status: (s(body.status) || "open") as DefectStatus,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Defect created." });
      }
      if (action === "update") {
        const id = s(body.id);
        const existing = await prisma.defect.findFirst({
          where: { id, project: { account: { companyId } } },
        });
        if (!existing) return bad("Not found.", 404);
        const row = await prisma.defect.update({
          where: { id },
          data: {
            title: body.title !== undefined ? s(body.title) || existing.title : existing.title,
            description: body.description !== undefined ? s(body.description) || null : existing.description,
            severity: body.severity !== undefined ? (s(body.severity) as DefectSeverity) : existing.severity,
            status: body.status !== undefined ? (s(body.status) as DefectStatus) : existing.status,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Defect updated." });
      }
      if (action === "rca") {
        const defectId = s(body.defectId);
        const defect = await prisma.defect.findFirst({
          where: { id: defectId, project: { account: { companyId } } },
        });
        if (!defect) return bad("Defect not found.", 404);
        const rootCause = s(body.rootCause);
        const correctiveAction = s(body.correctiveAction);
        if (!rootCause || !correctiveAction) return bad("Root cause and corrective action required.");
        const data = {
          problemStatement: s(body.problemStatement) || null,
          rootCause,
          contributingFactors: s(body.contributingFactors) || null,
          impact: s(body.impact) || null,
          containmentAction: s(body.containmentAction) || null,
          correctiveAction,
          preventiveAction: s(body.preventiveAction) || null,
          owner: s(body.owner) || null,
          targetDate: optDate(body.targetDate),
          status: (s(body.status) || "draft") as RcaStatus,
          reviewNotes: s(body.reviewNotes) || null,
        };
        const row = await prisma.rCA.upsert({
          where: { defectId },
          create: { defectId, ...data },
          update: data,
        });
        bump();
        return NextResponse.json({ item: row, message: "RCA saved." });
      }
      if (action === "review") {
        const defectId = s(body.defectId);
        const defect = await prisma.defect.findFirst({
          where: { id: defectId, project: { account: { companyId } } },
        });
        if (!defect) return bad("Defect not found.", 404);
        const rca = await prisma.rCA.findUnique({ where: { defectId } });
        const boolOf = (k: string) => body[k] === true;
        const data = {
          reviewerName: s(body.reviewerName) || null,
          reviewType: s(body.reviewType) || "internal",
          scopeSummary: s(body.scopeSummary) || null,
          codeReviewDone: boolOf("codeReviewDone"),
          testReviewDone: boolOf("testReviewDone"),
          documentationUpdated: boolOf("documentationUpdated"),
          clientCommunication: boolOf("clientCommunication"),
          regressionCovered: boolOf("regressionCovered"),
          findings: s(body.findings) || null,
          actionItems: s(body.actionItems) || null,
          residualRisk: s(body.residualRisk) || null,
          signOff: s(body.signOff) || null,
        };
        const row = await prisma.reviewSheet.upsert({
          where: { defectId },
          create: { defectId, rcaId: rca?.id ?? null, ...data },
          update: data,
        });
        bump();
        return NextResponse.json({ item: row, message: "Review sheet saved." });
      }
    }

    // ---------------- teams ----------------
    if (menu === "teams") {
      if (!(await can("manage_teams"))) return bad("No manage Teams permission.", 403);
      if (action === "muteIdentity") {
        const id = s(body.id);
        const identity = await prisma.teamsIdentity.findFirst({ where: { id, companyId } });
        if (!identity) return bad("Identity not found.", 404);
        await prisma.teamsIdentity.update({ where: { id }, data: { optedOut: body.muted === true } });
        bump();
        return NextResponse.json({ message: body.muted === true ? "Muted." : "Unmuted." });
      }
      if (action === "linkResource") {
        const id = s(body.id);
        const resourceId = s(body.resourceId) || null;
        const identity = await prisma.teamsIdentity.findFirst({ where: { id, companyId } });
        if (!identity) return bad("Identity not found.", 404);
        if (resourceId && !(await prisma.resource.findFirst({ where: { id: resourceId, companyId } }))) {
          return bad("Resource not found.", 404);
        }
        await prisma.teamsIdentity.update({ where: { id }, data: { resourceId } });
        bump();
        return NextResponse.json({ message: "Identity linked." });
      }
      if (action === "deleteIdentity") {
        const id = s(body.id);
        const identity = await prisma.teamsIdentity.findFirst({ where: { id, companyId } });
        if (!identity) return bad("Identity not found.", 404);
        await prisma.teamsIdentity.delete({ where: { id } });
        bump();
        return NextResponse.json({ message: "Identity removed." });
      }
      if (action === "deleteChannel") {
        const id = s(body.id);
        const channel = await prisma.teamsChannelLink.findFirst({ where: { id, companyId } });
        if (!channel) return bad("Channel not found.", 404);
        await prisma.teamsChannelLink.delete({ where: { id } });
        bump();
        return NextResponse.json({ message: "Channel removed." });
      }
    }

    return bad(`Unsupported menu/action: ${menu}/${action}`);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
