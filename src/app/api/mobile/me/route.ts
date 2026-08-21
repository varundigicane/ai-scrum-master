import { NextResponse } from "next/server";
import { getBearerToken, verifyMobileToken } from "@/lib/mobile-auth";
import { getEnabledFeatures } from "@/lib/permissions";
import { FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { toFriendlyError } from "@/lib/friendly-error";
import { cacheGet, cacheSet, companyCacheKey } from "@/lib/memory-cache";
import { getOverviewCharts } from "@/lib/overview-charts";

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

    const charts = await getOverviewCharts(payload.companyId);

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
      kpis: charts.kpis,
      charts: {
        rag: charts.rag,
        phases: charts.phases,
        defectSeverity: charts.defectSeverity,
        taskStatus: charts.taskStatus,
        statusToday: charts.statusToday,
        reminders: charts.reminders,
      },
    };
    cacheSet(cacheKey, body, 30_000);
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: toFriendlyError(error, "Session expired. Sign in again.") }, { status: 401 });
  }
}
