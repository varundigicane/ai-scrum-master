import { NextResponse } from "next/server";
import {
  runAllTeamsRelays,
  teamsChase,
  teamsDeadlines,
  teamsMissed,
  teamsRelayStatuses,
  teamsReminder,
  teamsWeekly,
} from "@/lib/teams/relay";

export const runtime = "nodejs";

const JOBS = [
  "teams-chase",
  "teams-reminder",
  "teams-relay",
  "teams-missed",
  "teams-deadlines",
  "teams-weekly",
  "teams-all",
] as const;

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
    case "teams-chase":
      return NextResponse.json(await teamsChase(body.companyId));
    case "teams-reminder":
      return NextResponse.json(await teamsReminder(body.companyId));
    case "teams-relay":
      return NextResponse.json(await teamsRelayStatuses(body.companyId));
    case "teams-missed":
      return NextResponse.json(await teamsMissed(body.companyId));
    case "teams-deadlines":
      return NextResponse.json(await teamsDeadlines(body.companyId));
    case "teams-weekly":
      return NextResponse.json(await teamsWeekly(body.companyId));
    case "teams-all":
      return NextResponse.json(await runAllTeamsRelays(body.companyId));
    default:
      return NextResponse.json({ error: "Unknown job", jobs: JOBS }, { status: 400 });
  }
}
