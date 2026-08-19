import { NextResponse } from "next/server";
import { getBearerToken, verifyMobileToken } from "@/lib/mobile-auth";
import { getEnabledFeatures } from "@/lib/permissions";
import { FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { toFriendlyError } from "@/lib/friendly-error";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const payload = await verifyMobileToken(token);

    const enabled = await getEnabledFeatures(payload.companyId, payload.role);
    const menus = FEATURE_CATALOG.filter((f) => f.kind === "menu" && enabled.has(f.key)).map((f) => ({
      key: f.key,
      label: f.label,
      href: f.href,
    }));

    const [accounts, projects, resources, pendingStatus, overdueTasks] = await Promise.all([
      prisma.account.count({ where: { companyId: payload.companyId, active: true } }),
      prisma.project.count({ where: { account: { companyId: payload.companyId }, active: true } }),
      prisma.resource.count({ where: { companyId: payload.companyId, active: true } }),
      prisma.statusRequest.count({
        where: { statusWindow: { companyId: payload.companyId }, state: "pending" },
      }),
      prisma.task.count({
        where: {
          project: { account: { companyId: payload.companyId } },
          status: { not: "done" },
          clientDeadline: { lt: new Date() },
        },
      }),
    ]);

    return NextResponse.json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        roleLabel: ROLE_LABELS[payload.role] ?? payload.role,
        companyId: payload.companyId,
      },
      menus,
      kpis: { accounts, projects, resources, pendingStatus, overdueTasks },
    });
  } catch (error) {
    return NextResponse.json({ error: toFriendlyError(error, "Session expired. Sign in again.") }, { status: 401 });
  }
}
