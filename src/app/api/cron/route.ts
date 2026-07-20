import { NextResponse } from "next/server";
import {
  closeExpiredStatusWindows,
  generateWeeklyReports,
  openDailyStatusWindow,
  sweepDeadlines,
} from "@/lib/agent";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? "dev-cron-secret";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { job?: string; companyId?: string };
  const job = body.job ?? new URL(req.url).searchParams.get("job");

  switch (job) {
    case "open-status-window":
      return NextResponse.json(await openDailyStatusWindow(body.companyId));
    case "close-status-window":
      return NextResponse.json(await closeExpiredStatusWindows(body.companyId));
    case "deadline-sweep":
      return NextResponse.json(await sweepDeadlines(body.companyId));
    case "weekly-reports":
      return NextResponse.json(await generateWeeklyReports(body.companyId));
    case "run-all-daily":
      return NextResponse.json({
        open: await openDailyStatusWindow(body.companyId),
        close: await closeExpiredStatusWindows(body.companyId),
        deadlines: await sweepDeadlines(body.companyId),
      });
    default:
      return NextResponse.json(
        {
          error: "Unknown job",
          jobs: [
            "open-status-window",
            "close-status-window",
            "deadline-sweep",
            "weekly-reports",
            "run-all-daily",
          ],
        },
        { status: 400 },
      );
  }
}
