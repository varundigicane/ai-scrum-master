import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBearerToken, verifyMobileToken } from "@/lib/mobile-auth";
import { hasFeature } from "@/lib/permissions";
import { toFriendlyError } from "@/lib/friendly-error";

async function requireMobileMeeting(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Sign in required.");
  const payload = await verifyMobileToken(token);
  const ok = await hasFeature(payload.companyId, payload.role, "meeting_notes");
  if (!ok) throw new Error("You do not have permission to do that. Ask a Company Admin to update Feature access.");
  return payload;
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileMeeting(req);
    const notes = await prisma.meetingNote.findMany({
      where: { companyId: payload.companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        attendees: true,
        updatedAt: true,
        summary: { select: { id: true } },
        proposal: { select: { id: true } },
      },
    });
    return NextResponse.json({ notes });
  } catch (error) {
    const msg = toFriendlyError(error);
    const status = msg.includes("Sign in") ? 401 : msg.includes("permission") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileMeeting(req);
    const body = (await req.json()) as { title?: string; attendees?: string; rawNotes?: string };
    const title = String(body.title ?? "").trim();
    const rawNotes = String(body.rawNotes ?? "").trim();
    if (!title || !rawNotes) {
      return NextResponse.json({ error: "Title and notes are required." }, { status: 400 });
    }
    const note = await prisma.meetingNote.create({
      data: {
        companyId: payload.companyId,
        createdById: payload.sub,
        title,
        attendees: String(body.attendees ?? ""),
        rawNotes,
      },
    });
    return NextResponse.json({ note });
  } catch (error) {
    const msg = toFriendlyError(error);
    const status = msg.includes("Sign in") ? 401 : msg.includes("permission") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
