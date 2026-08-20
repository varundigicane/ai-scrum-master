import { NextResponse } from "next/server";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import {
  createMeetingNoteRecord,
  searchMeetingNotes,
  invalidateNotesCache,
} from "@/lib/meeting-note-crm";
import { NOTE_TEMPLATES } from "@/lib/meeting-note-templates";
import { cacheGet, cacheSet, companyCacheKey } from "@/lib/memory-cache";

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const cacheKey = companyCacheKey(payload.companyId, "meeting-notes", `${q}:${status}`);
    const cached = cacheGet<{ notes: unknown }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    let notes = await searchMeetingNotes(payload.companyId, q);
    if (status) notes = notes.filter((n) => n.noteStatus === status);
    const body = { notes, templates: NOTE_TEMPLATES };
    cacheSet(cacheKey, body);
    return NextResponse.json(body);
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    const body = (await req.json()) as {
      title?: string;
      attendees?: string;
      rawNotes?: string;
      templateKey?: string;
      noteStatus?: string;
    };
    const note = await createMeetingNoteRecord({
      companyId: payload.companyId,
      createdById: payload.sub,
      title: String(body.title ?? "").trim(),
      attendees: String(body.attendees ?? ""),
      rawNotes: String(body.rawNotes ?? "").trim(),
      templateKey: body.templateKey ?? null,
      noteStatus:
        body.noteStatus === "in_progress" ||
        body.noteStatus === "blocker" ||
        body.noteStatus === "done" ||
        body.noteStatus === "todo"
          ? body.noteStatus
          : "todo",
    });
    invalidateNotesCache(payload.companyId);
    return NextResponse.json({ note });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
