import { NextResponse } from "next/server";
import { getBearerToken, verifyMobileToken } from "@/lib/mobile-auth";
import { getEnabledFeatures } from "@/lib/permissions";
import { FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { toFriendlyError } from "@/lib/friendly-error";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, companyCacheKey } from "@/lib/memory-cache";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const payload = await verifyMobileToken(token);

    const cacheKey = companyCacheKey(payload.companyId, "me", `${payload.sub}:${payload.role}`);
    const cached = cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return NextResponse.json(cached);

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

    const body = {
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
    };
    cacheSet(cacheKey, body, 30_000);
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: toFriendlyError(error, "Session expired. Sign in again.") }, { status: 401 });
  }
}
