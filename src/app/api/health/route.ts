import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liveness / readiness for Railway health checks */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, db: "down", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
