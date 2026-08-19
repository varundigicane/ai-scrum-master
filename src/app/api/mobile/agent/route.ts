import { NextResponse } from "next/server";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { hasFeature } from "@/lib/permissions";

const JOBS = [
  {
    job: "open-status-window",
    title: "Open daily status window",
    desc: "Email every active resource a unique link that expires 2 hours after window start.",
  },
  {
    job: "close-status-window",
    title: "Close expired windows",
    desc: "Mark pending requests expired and email missing list to PM / Account Manager.",
  },
  {
    job: "deadline-sweep",
    title: "Deadline sweep",
    desc: "Notify for approaching (3d/1d) and overdue client & resource deadlines.",
  },
  {
    job: "weekly-reports",
    title: "Generate weekly packs",
    desc: "Create and email resource-wise, project-wise, and management digests.",
  },
] as const;

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "agent");
    const canRun = await hasFeature(payload.companyId, payload.role, "run_agent");
    return NextResponse.json({ jobs: JOBS, canRun });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "agent");
    const canRun = await hasFeature(payload.companyId, payload.role, "run_agent");
    if (!canRun) {
      return NextResponse.json(
        { error: "You do not have permission to do that. Ask a Company Admin to update Feature access." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { job?: string };
    const job = String(body.job ?? "");
    const {
      openDailyStatusWindow,
      closeExpiredStatusWindows,
      sweepDeadlines,
      generateWeeklyReports,
    } = await import("@/lib/agent");

    switch (job) {
      case "open-status-window":
        await openDailyStatusWindow(payload.companyId);
        break;
      case "close-status-window":
        await closeExpiredStatusWindows(payload.companyId);
        break;
      case "deadline-sweep":
        await sweepDeadlines(payload.companyId);
        break;
      case "weekly-reports":
        await generateWeeklyReports(payload.companyId);
        break;
      default:
        return NextResponse.json({ error: "Unknown job." }, { status: 400 });
    }

    return NextResponse.json({ message: `Job “${job}” completed.` });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
