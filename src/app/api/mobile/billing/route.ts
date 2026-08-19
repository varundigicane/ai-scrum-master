import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildMonthlyBilling, HOURS_PER_DAY } from "@/lib/billing";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { hasFeature } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "billing");
    const url = new URL(req.url);
    const now = new Date();
    const year = Number(url.searchParams.get("year") ?? now.getFullYear());
    const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);

    const override = await prisma.billingMonthOverride.findUnique({
      where: {
        companyId_year_month: {
          companyId: payload.companyId,
          year,
          month,
        },
      },
    });

    const billing = await buildMonthlyBilling({
      companyId: payload.companyId,
      year,
      month,
    });

    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_delivery");

    return NextResponse.json({
      year,
      month,
      hoursPerDay: HOURS_PER_DAY,
      canEdit,
      override,
      grandTotal: billing.grandTotal,
      byAccount: billing.byAccount,
      byProject: billing.byProject,
      byResource: billing.byResource,
      lines: billing.lines,
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "billing");
    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_delivery");
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to do that. Ask a Company Admin to update Feature access." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      year?: number;
      month?: number;
      totalWorkingDays?: number;
      note?: string;
    };
    const year = Number(body.year);
    const month = Number(body.month);
    const totalWorkingDays = Number(body.totalWorkingDays);
    if (!year || !month || Number.isNaN(totalWorkingDays)) {
      return NextResponse.json({ error: "Year, month, and total working days are required." }, { status: 400 });
    }

    const override = await prisma.billingMonthOverride.upsert({
      where: {
        companyId_year_month: { companyId: payload.companyId, year, month },
      },
      create: {
        companyId: payload.companyId,
        year,
        month,
        totalWorkingDays,
        note: String(body.note ?? "") || null,
      },
      update: {
        totalWorkingDays,
        note: String(body.note ?? "") || null,
      },
    });

    return NextResponse.json({ override, message: "Working days override saved." });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
