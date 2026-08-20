import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { hasFeature } from "@/lib/permissions";
import { cacheInvalidatePrefix } from "@/lib/memory-cache";
import bcrypt from "bcryptjs";
import type { FeatureKey } from "@/lib/roles";
import { ALL_ROLES } from "@/lib/roles";
import type { LeaveType, Role } from "@/generated/prisma/enums";

/**
 * Unified mobile write API for catalog menus.
 * POST body: { menu, action, ...fields }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const menu = String(body.menu ?? "") as FeatureKey;
    const action = String(body.action ?? "create");
    if (!menu) return NextResponse.json({ error: "menu required" }, { status: 400 });

    const payload = await requireMobileFeature(req, menu);
    const companyId = payload.companyId;

    const bump = () => cacheInvalidatePrefix(`${companyId}:`);

    if (menu === "accounts") {
      if (!(await hasFeature(companyId, payload.role, "edit_delivery"))) {
        return NextResponse.json({ error: "No edit permission." }, { status: 403 });
      }
      if (action === "create") {
        const name = String(body.name ?? "").trim();
        if (!name) return NextResponse.json({ error: "Name required." }, { status: 400 });
        const row = await prisma.account.create({
          data: {
            companyId,
            name,
            code: String(body.code ?? "").trim() || null,
            technology: String(body.technology ?? "").trim() || null,
            domain: String(body.domain ?? "").trim() || null,
            projectManagers: String(body.projectManagers ?? "").trim() || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Account created." });
      }
      if (action === "update") {
        const id = String(body.id ?? "");
        const existing = await prisma.account.findFirst({ where: { id, companyId } });
        if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const row = await prisma.account.update({
          where: { id },
          data: {
            name: String(body.name ?? existing.name).trim(),
            code: body.code !== undefined ? String(body.code).trim() || null : existing.code,
            active: body.active === false ? false : body.active === true ? true : existing.active,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Account updated." });
      }
    }

    if (menu === "resources") {
      if (!(await hasFeature(companyId, payload.role, "edit_delivery"))) {
        return NextResponse.json({ error: "No edit permission." }, { status: 403 });
      }
      if (action === "create") {
        const name = String(body.name ?? "").trim();
        const email = String(body.email ?? "").trim();
        if (!name || !email) return NextResponse.json({ error: "Name and email required." }, { status: 400 });
        const row = await prisma.resource.create({
          data: {
            companyId,
            name,
            email,
            employeeId: String(body.employeeId ?? "").trim() || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Resource created." });
      }
      if (action === "update") {
        const id = String(body.id ?? "");
        const existing = await prisma.resource.findFirst({ where: { id, companyId } });
        if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const row = await prisma.resource.update({
          where: { id },
          data: {
            name: String(body.name ?? existing.name).trim(),
            email: String(body.email ?? existing.email).trim(),
            employeeId:
              body.employeeId !== undefined
                ? String(body.employeeId).trim() || null
                : existing.employeeId,
            active: body.active === false ? false : body.active === true ? true : existing.active,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Resource updated." });
      }
    }

    if (menu === "users") {
      if (!(await hasFeature(companyId, payload.role, "manage_users"))) {
        return NextResponse.json({ error: "No manage users permission." }, { status: 403 });
      }
      if (action === "create") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const name = String(body.name ?? "").trim();
        const password = String(body.password ?? "");
        const role = String(body.role ?? "Employee") as Role;
        if (!email || !name || password.length < 6) {
          return NextResponse.json({ error: "Name, email, and password (6+) required." }, { status: 400 });
        }
        if (!ALL_ROLES.includes(role)) {
          return NextResponse.json({ error: "Invalid role." }, { status: 400 });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const row = await prisma.user.create({
          data: { companyId, email, name, passwordHash, role },
        });
        bump();
        return NextResponse.json({
          item: { id: row.id, email: row.email, name: row.name, role: row.role },
          message: "User created.",
        });
      }
      if (action === "updateRole") {
        const id = String(body.id ?? "");
        const role = String(body.role ?? "") as Role;
        if (!ALL_ROLES.includes(role)) {
          return NextResponse.json({ error: "Invalid role." }, { status: 400 });
        }
        const existing = await prisma.user.findFirst({ where: { id, companyId } });
        if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const row = await prisma.user.update({ where: { id }, data: { role } });
        bump();
        return NextResponse.json({ item: { id: row.id, role: row.role }, message: "Role updated." });
      }
    }

    if (menu === "leaves") {
      if (!(await hasFeature(companyId, payload.role, "edit_delivery"))) {
        return NextResponse.json({ error: "No edit permission." }, { status: 403 });
      }
      if (action === "create") {
        const resourceId = String(body.resourceId ?? "");
        const startDate = new Date(String(body.startDate ?? ""));
        const endDate = new Date(String(body.endDate ?? ""));
        if (!resourceId || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          return NextResponse.json({ error: "Resource and dates required." }, { status: 400 });
        }
        const resource = await prisma.resource.findFirst({ where: { id: resourceId, companyId } });
        if (!resource) return NextResponse.json({ error: "Resource not found." }, { status: 404 });
        const row = await prisma.leave.create({
          data: {
            resourceId,
            startDate,
            endDate,
            type: (String(body.type ?? "internal") as LeaveType) || "internal",
            reason: String(body.reason ?? "").trim() || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Leave created." });
      }
    }

    if (menu === "quality") {
      if (!(await hasFeature(companyId, payload.role, "edit_delivery"))) {
        return NextResponse.json({ error: "No edit permission." }, { status: 403 });
      }
      if (action === "create") {
        const projectId = String(body.projectId ?? "");
        const title = String(body.title ?? "").trim();
        if (!projectId || !title) {
          return NextResponse.json({ error: "Project and title required." }, { status: 400 });
        }
        const project = await prisma.project.findFirst({
          where: { id: projectId, account: { companyId } },
        });
        if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
        const row = await prisma.defect.create({
          data: {
            projectId,
            title,
            description: String(body.description ?? "").trim() || null,
          },
        });
        bump();
        return NextResponse.json({ item: row, message: "Defect created." });
      }
    }

    return NextResponse.json({ error: `Unsupported menu/action: ${menu}/${action}` }, { status: 400 });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
