import { NextResponse } from "next/server";
import { processTeamsActivity } from "@/lib/teams/adapter";
import { isTeamsConfigured } from "@/lib/teams/config";
import { getScrumBot } from "@/lib/teams/handler";

// Bot Framework activities are authenticated by the adapter (JWT issuer, audience and
// serviceUrl), which is why this route is in the public list in src/lib/auth.config.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isTeamsConfigured()) {
    return NextResponse.json(
      { error: "Teams bot is not configured (MICROSOFT_APP_ID / MICROSOFT_APP_PASSWORD)" },
      { status: 503 },
    );
  }

  const bot = getScrumBot();
  const result = await processTeamsActivity(req, (context) => bot.run(context));

  if (result.body === undefined) {
    return new NextResponse(null, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isTeamsConfigured(),
    hint: "Point the Azure Bot messaging endpoint at this URL and POST activities to it.",
  });
}
