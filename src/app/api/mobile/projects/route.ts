import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, verifyMobileToken } from "@/lib/mobile-auth";
import { hasFeature } from "@/lib/permissions";
import { toFriendlyError } from "@/lib/friendly-error";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const payload = await verifyMobileToken(token);
    const ok = await hasFeature(payload.companyId, payload.role, "projects");
    if (!ok) return NextResponse.json({ error: "You do not have permission to view projects." }, { status: 403 });

    const projects = await prisma.project.findMany({
      where: { account: { companyId: payload.companyId }, active: true },
      include: { account: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        phase: p.phase,
        accountName: p.account.name,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: toFriendlyError(error) }, { status: 401 });
  }
}
