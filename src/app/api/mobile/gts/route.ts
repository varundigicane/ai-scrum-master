import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { hasFeature } from "@/lib/permissions";
import { buildGtsMonthDraft, summarizeGtsLines } from "@/lib/gts-report";

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "gts_report");
    const url = new URL(req.url);
    const now = new Date();
    const accountId = url.searchParams.get("accountId") ?? "";
    const year = Number(url.searchParams.get("year") ?? now.getFullYear());
    const month = Number(url.searchParams.get("month") ?? now.getMonth() + 1);

    const accounts = await prisma.account.findMany({
      where: { companyId: payload.companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_delivery");

    if (!accountId) {
      return NextResponse.json({ accounts, year, month, canEdit, report: null });
    }

    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const report = await prisma.gtsMonthlyReport.findUnique({
      where: { accountId_year_month: { accountId, year, month } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({
      accounts,
      year,
      month,
      canEdit,
      account,
      report,
      summary: report
        ? summarizeGtsLines(report.lines, report.utilizationPct, report.availabilityPct)
        : null,
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "gts_report");
    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_delivery");
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to do that. Ask a Company Admin to update Feature access." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as {
      action?: string;
      accountId?: string;
      year?: number;
      month?: number;
      replaceLines?: boolean;
      reportId?: string;
      projectName?: string;
      projectManagers?: string;
      technology?: string;
      domain?: string;
      utilizationPct?: number;
      availabilityPct?: number;
      remarks?: string;
    };

    const action = String(body.action ?? "generate");

    if (action === "generate") {
      const accountId = String(body.accountId ?? "");
      const year = Number(body.year);
      const month = Number(body.month);
      if (!accountId || !year || !month) {
        return NextResponse.json({ error: "Account, year, and month required." }, { status: 400 });
      }

      const account = await prisma.account.findFirst({
        where: { id: accountId, companyId: payload.companyId },
      });
      if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

      const replaceLines = body.replaceLines !== false;
      const draft = await buildGtsMonthDraft({
        companyId: payload.companyId,
        accountId,
        year,
        month,
      });

      const report = await prisma.gtsMonthlyReport.upsert({
        where: { accountId_year_month: { accountId, year, month } },
        create: {
          companyId: payload.companyId,
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
        include: { lines: true },
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

      const refreshed = await prisma.gtsMonthlyReport.findUnique({
        where: { id: report.id },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });

      return NextResponse.json({ report: refreshed, message: "GTS report generated." });
    }

    if (action === "save-header") {
      const reportId = String(body.reportId ?? "");
      const report = await prisma.gtsMonthlyReport.findFirst({
        where: { id: reportId, companyId: payload.companyId },
      });
      if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

      const updated = await prisma.gtsMonthlyReport.update({
        where: { id: reportId },
        data: {
          projectName: String(body.projectName ?? "").trim() || null,
          projectManagers: String(body.projectManagers ?? "").trim() || null,
          technology: String(body.technology ?? "").trim() || null,
          domain: String(body.domain ?? "").trim() || null,
          utilizationPct: Number(body.utilizationPct || 0),
          availabilityPct: Number(body.availabilityPct || 0),
          remarks: String(body.remarks ?? "").trim() || null,
        },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      return NextResponse.json({ report: updated, message: "GTS header saved." });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
