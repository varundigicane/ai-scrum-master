import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import type { FeatureKey } from "@/lib/roles";
import { ALL_ROLES, FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { getTeamsConfig } from "@/lib/teams/link";
import type { Role } from "@/generated/prisma/enums";

const MENU_KEYS = new Set(
  FEATURE_CATALOG.filter((f) => f.kind === "menu").map((f) => f.key),
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = (url.searchParams.get("key") ?? "").trim() as FeatureKey;
    if (!key || !MENU_KEYS.has(key)) {
      return NextResponse.json({ error: "Unknown menu." }, { status: 400 });
    }

    const payload = await requireMobileFeature(req, key);
    const companyId = payload.companyId;
    const projectId = url.searchParams.get("projectId")?.trim() || undefined;

    switch (key) {
      case "accounts": {
        const accounts = await prisma.account.findMany({
          where: { companyId },
          include: { _count: { select: { projects: true } } },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({
          items: accounts.map((a) => ({
            id: a.id,
            title: a.name,
            subtitle: `${a.code ?? "—"} · ${a._count.projects} projects · ${a.active ? "active" : "inactive"}`,
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
          items: resources.map((r) => ({
            id: r.id,
            title: r.name,
            subtitle: `${r.employeeId ?? "—"} · ${r.email} · ${r.assignments.length} projects · ${r.active ? "active" : "inactive"}`,
          })),
        });
      }
      case "users": {
        const users = await prisma.user.findMany({
          where: { companyId },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        });
        return NextResponse.json({
          items: users.map((u) => ({
            id: u.id,
            title: u.name,
            subtitle: `${u.email} · ${ROLE_LABELS[u.role as Role] ?? u.role}`,
          })),
        });
      }
      case "permissions": {
        return NextResponse.json({
          items: ALL_ROLES.map((role) => ({
            id: role,
            title: ROLE_LABELS[role],
            subtitle: `Role key: ${role} — edit matrix on web Feature access`,
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
        const leaves = await prisma.leave.findMany({
          where: { resource: { companyId } },
          include: { resource: { select: { name: true } } },
          orderBy: { startDate: "desc" },
          take: 50,
        });
        return NextResponse.json({
          items: leaves.map((l) => ({
            id: l.id,
            title: l.resource.name,
            subtitle: `${l.type} · ${l.startDate.toISOString().slice(0, 10)} → ${l.endDate.toISOString().slice(0, 10)}${l.reason ? ` · ${l.reason}` : ""}`,
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
        const requirements = pid
          ? await prisma.requirement.findMany({
              where: { projectId: pid },
              orderBy: { createdAt: "desc" },
              take: 100,
            })
          : [];
        return NextResponse.json({
          projects: projects.map((p) => ({
            id: p.id,
            name: `${p.account.name} / ${p.name}`,
            counts: `${p._count.requirements} items · ${p._count.tasks} tasks`,
          })),
          projectId: pid ?? null,
          items: requirements.map((b) => ({
            id: b.id,
            title: b.title,
            subtitle: `${b.kind}${b.displayId ? ` · ${b.displayId}` : ""}${b.closed ? " · closed" : ""}`,
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
              const s = t.status ?? "unknown";
              acc[s] = (acc[s] ?? 0) + 1;
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
        const defects = await prisma.defect.findMany({
          where: { project: { account: { companyId } } },
          include: { project: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        return NextResponse.json({
          items: defects.map((d) => ({
            id: d.id,
            title: d.title,
            subtitle: `${d.project.name} · ${d.severity} · ${d.status}`,
          })),
        });
      }
      case "teams": {
        const config = await getTeamsConfig(companyId);
        const [identities, channels, resources] = await Promise.all([
          prisma.teamsIdentity.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          prisma.teamsChannelLink.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
          prisma.resource.findMany({
            where: { companyId, active: true },
            select: { id: true, name: true },
          }),
        ]);
        const resourceById = new Map(resources.map((r) => [r.id, r.name]));
        return NextResponse.json({
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
              title: i.displayName ?? i.upn ?? i.aadObjectId,
              subtitle: `Identity · ${i.resourceId ? resourceById.get(i.resourceId) ?? "linked" : "unlinked"}${i.optedOut ? " · muted" : ""}`,
            })),
            ...channels.map((c) => ({
              id: c.id,
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
