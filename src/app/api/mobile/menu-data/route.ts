import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import type { FeatureKey } from "@/lib/roles";
import { ALL_ROLES, FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { getTeamsConfig } from "@/lib/teams/link";
import { hasFeature, getRoleFeatureMatrix } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

const MENU_KEYS = new Set(
  FEATURE_CATALOG.filter((f) => f.kind === "menu").map((f) => f.key),
);
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = (url.searchParams.get("key") ?? "").trim() as FeatureKey;
    if (!key || !MENU_KEYS.has(key)) {
      return NextResponse.json({ error: "Unknown menu." }, { status: 400 });
    }

    const payload = await requireMobileFeature(req, key);
    const companyId = payload.companyId;
    const role = payload.role;
    const projectId = url.searchParams.get("projectId")?.trim() || undefined;
    const canEditDelivery = await hasFeature(companyId, role, "edit_delivery");

    // Shared option lists for edit forms.
    const resourceOptions = () =>
      prisma.resource
        .findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
        .then((rows) => rows.map((r) => ({ id: r.id, name: r.name })));
    const projectOptions = () =>
      prisma.project
        .findMany({
          where: { account: { companyId }, active: true },
          include: { account: { select: { name: true } } },
          orderBy: { name: "asc" },
        })
        .then((rows) => rows.map((p) => ({ id: p.id, name: `${p.account.name} / ${p.name}` })));

    switch (key) {
      case "accounts": {
        const accounts = await prisma.account.findMany({
          where: { companyId },
          include: { _count: { select: { projects: true } } },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({
          canEdit: canEditDelivery,
          items: accounts.map((a) => ({
            id: a.id,
            title: a.name,
            subtitle: `${a.code ?? "—"} · ${a._count.projects} projects · ${a.active ? "active" : "inactive"}`,
            name: a.name,
            code: a.code ?? "",
            technology: a.technology ?? "",
            domain: a.domain ?? "",
            projectManagers: a.projectManagers ?? "",
            active: a.active,
          })),
        });
      }
      case "projects": {
        const projects = await prisma.project.findMany({
          where: { account: { companyId } },
          include: {
            account: { select: { id: true, name: true } },
            assignments: {
              where: { active: true },
              include: { resource: { select: { id: true, name: true } } },
            },
          },
          orderBy: { name: "asc" },
        });
        const [accounts, resources] = await Promise.all([
          prisma.account.findMany({
            where: { companyId, active: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          resourceOptions(),
        ]);
        return NextResponse.json({
          canEdit: canEditDelivery,
          accounts,
          resources,
          items: projects.map((p) => ({
            id: p.id,
            title: `${p.account.name} / ${p.name}`,
            subtitle: `${p.phase} · ${p.billable ? "billable" : "non-billable"} · ${p.assignments.length} assigned · ${p.active ? "active" : "inactive"}`,
            name: p.name,
            accountId: p.accountId,
            phase: p.phase,
            billable: p.billable,
            active: p.active,
            startDate: iso(p.startDate),
            endDate: iso(p.endDate),
            assignments: p.assignments.map((a) => ({
              resourceId: a.resourceId,
              resourceName: a.resource.name,
              capacityPct: a.capacityPct,
              hourlyRate: a.hourlyRate,
              billable: a.billable,
            })),
          })),
        });
      }
      case "resources": {
        const resources = await prisma.resource.findMany({
          where: { companyId },
          include: { assignments: { where: { active: true } } },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({
          canEdit: canEditDelivery,
          items: resources.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: `${r.employeeId ?? "—"} · ${r.email} · ${r.assignments.length} projects · ${r.active ? "active" : "inactive"}`,
            name: r.name,
            email: r.email,
            employeeId: r.employeeId ?? "",
            active: r.active,
          })),
        });
      }
      case "users": {
        const users = await prisma.user.findMany({
          where: { companyId },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        });
        return NextResponse.json({
          canEdit: await hasFeature(companyId, role, "manage_users"),
          roles: ALL_ROLES.map((r) => ({ id: r, name: ROLE_LABELS[r] })),
          items: users.map((u) => ({
            id: u.id,
            title: u.name,
            subtitle: `${u.email} · ${ROLE_LABELS[u.role as Role] ?? u.role}`,
            name: u.name,
            email: u.email,
            role: u.role,
          })),
        });
      }
      case "permissions": {
        const canEdit = await hasFeature(companyId, role, "permissions");
        const matrix = await getRoleFeatureMatrix(companyId).catch(() => null);
        return NextResponse.json({
          canEdit,
          features: FEATURE_CATALOG.map((f) => ({ key: f.key, label: f.label, kind: f.kind })),
          roles: ALL_ROLES.map((r) => ({ id: r, name: ROLE_LABELS[r] })),
          matrix,
          items: ALL_ROLES.map((r) => ({
            id: r,
            title: ROLE_LABELS[r],
            subtitle: `Role key: ${r}`,
            role: r,
          })),
        });
      }
      case "status": {
        const windows = await prisma.statusWindow.findMany({
          where: { companyId },
          include: { requests: true },
          orderBy: { date: "desc" },
          take: 14,
        });
        return NextResponse.json({
          items: windows.map((w) => {
            const submitted = w.requests.filter((r) => r.state === "submitted").length;
            const pending = w.requests.filter((r) => r.state === "pending").length;
            return {
              id: w.id,
              title: w.date.toISOString().slice(0, 10),
              subtitle: `Submitted ${submitted} · Pending ${pending} · ${w.requests.length} total`,
            };
          }),
        });
      }
      case "leaves": {
        const [leaves, resources] = await Promise.all([
          prisma.leave.findMany({
            where: { resource: { companyId } },
            include: { resource: { select: { name: true } } },
            orderBy: { startDate: "desc" },
            take: 50,
          }),
          resourceOptions(),
        ]);
        return NextResponse.json({
          canEdit: canEditDelivery,
          resources,
          projects: await projectOptions(),
          items: leaves.map((l) => ({
            id: l.id,
            title: l.resource.name,
            subtitle: `${l.type} · ${iso(l.startDate)} → ${iso(l.endDate)}${l.reason ? ` · ${l.reason}` : ""}`,
            resourceId: l.resourceId,
            type: l.type,
            startDate: iso(l.startDate),
            endDate: iso(l.endDate),
            reason: l.reason ?? "",
          })),
        });
      }
      case "reports": {
        const reports = await prisma.weeklyReport.findMany({
          where: { companyId },
          orderBy: { periodStart: "desc" },
          take: 30,
        });
        return NextResponse.json({
          items: reports.map((r) => ({
            id: r.id,
            title: `Week of ${r.periodStart.toISOString().slice(0, 10)}`,
            subtitle: `${r.scope} · ${r.scopeId}`,
          })),
        });
      }
      case "backlog": {
        const projects = await prisma.project.findMany({
          where: { account: { companyId }, active: true },
          include: {
            account: { select: { name: true } },
            _count: { select: { requirements: true, tasks: true } },
          },
          orderBy: { name: "asc" },
        });
        const pid = projectId ?? projects[0]?.id;
        const [requirements, tasks, resources] = pid
          ? await Promise.all([
              prisma.requirement.findMany({ where: { projectId: pid }, orderBy: { createdAt: "desc" }, take: 200 }),
              prisma.task.findMany({
                where: { projectId: pid },
                include: { resource: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
                take: 200,
              }),
              resourceOptions(),
            ])
          : [[], [], []];
        return NextResponse.json({
          canEdit: canEditDelivery,
          resources,
          projects: projects.map((p) => ({
            id: p.id,
            name: `${p.account.name} / ${p.name}`,
            counts: `${p._count.requirements} items · ${p._count.tasks} tasks`,
          })),
          projectId: pid ?? null,
          items: (requirements as Array<Record<string, unknown>>).map((b) => ({
            id: b.id as string,
            type: "requirement",
            title: b.title as string,
            subtitle: `${b.kind}${b.displayId ? ` · ${b.displayId}` : ""}${b.closed ? " · closed" : ""}`,
            kind: b.kind,
            description: (b.description as string) ?? "",
            closed: b.closed,
          })),
          tasks: (tasks as Array<Record<string, unknown>>).map((t) => ({
            id: t.id as string,
            type: "task",
            title: t.title as string,
            subtitle: `${t.status}${t.displayId ? ` · ${t.displayId}` : ""}${
              (t.resource as { name?: string } | null)?.name ? ` · ${(t.resource as { name: string }).name}` : ""
            }`,
            status: t.status,
            description: (t.description as string) ?? "",
            resourceId: (t.resourceId as string) ?? "",
            phase: t.phase,
          })),
        });
      }
      case "workboard": {
        const projects = await prisma.project.findMany({
          where: { account: { companyId }, active: true },
          include: {
            account: { select: { name: true } },
            tasks: { select: { status: true } },
          },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({
          items: projects.map((p) => {
            const counts = p.tasks.reduce<Record<string, number>>((acc, t) => {
              const st = t.status ?? "unknown";
              acc[st] = (acc[st] ?? 0) + 1;
              return acc;
            }, {});
            const summary = Object.entries(counts)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ");
            return {
              id: p.id,
              title: `${p.account.name} / ${p.name}`,
              subtitle: summary || "No tasks",
            };
          }),
        });
      }
      case "quality": {
        const [defects, projects] = await Promise.all([
          prisma.defect.findMany({
            where: { project: { account: { companyId } } },
            include: { project: { select: { name: true } }, rca: true, reviewSheet: true },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          projectOptions(),
        ]);
        return NextResponse.json({
          canEdit: canEditDelivery,
          projects,
          items: defects.map((d) => ({
            id: d.id,
            title: d.title,
            subtitle: `${d.project.name} · ${d.severity} · ${d.status}${d.rca ? " · RCA" : ""}${d.reviewSheet ? " · Review" : ""}`,
            projectId: d.projectId,
            description: d.description ?? "",
            severity: d.severity,
            status: d.status,
            hasRca: !!d.rca,
            hasReview: !!d.reviewSheet,
          })),
        });
      }
      case "teams": {
        const config = await getTeamsConfig(companyId);
        const [identities, channels, resources] = await Promise.all([
          prisma.teamsIdentity.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
          prisma.teamsChannelLink.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 50 }),
          prisma.resource.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
        ]);
        const resourceById = new Map(resources.map((r) => [r.id, r.name]));
        return NextResponse.json({
          canEdit: await hasFeature(companyId, role, "manage_teams"),
          resources: resources.map((r) => ({ id: r.id, name: r.name })),
          summary: {
            enabled: config.enabled,
            chaseEnabled: config.chaseEnabled,
            identities: identities.length,
            channels: channels.length,
            hint: "Configure bot credentials and agent options in Settings → MS Teams",
          },
          items: [
            ...identities.map((i) => ({
              id: i.id,
              kind: "identity",
              title: i.displayName ?? i.upn ?? i.aadObjectId,
              subtitle: `Identity · ${i.resourceId ? resourceById.get(i.resourceId) ?? "linked" : "unlinked"}${i.optedOut ? " · muted" : ""}`,
              resourceId: i.resourceId ?? "",
              muted: i.optedOut,
            })),
            ...channels.map((c) => ({
              id: c.id,
              kind: "channel",
              title: c.name ?? c.channelId ?? c.id,
              subtitle: `Channel · ${c.active ? "active" : "inactive"} · ${c.notifyTypes}`,
            })),
          ],
        });
      }
      default:
        return NextResponse.json({ items: [] });
    }
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
