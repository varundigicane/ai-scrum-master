import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";
import { getMeetingNoteDetail, noteToMarkdown } from "@/lib/meeting-note-crm";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!(await hasFeature(session.user.companyId, session.user.role, "meeting_notes"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const note = await getMeetingNoteDetail(session.user.companyId, id);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format") ?? "md";
  const md = noteToMarkdown(note);
  if (format === "pdf") {
    // Lightweight printable HTML that browsers can Save as PDF
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${note.functionalId ?? note.title}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;line-height:1.5}
      pre{white-space:pre-wrap}</style></head><body>
      <pre>${md.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
      <script>window.onload=()=>window.print()</script></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${note.functionalId ?? note.id}.md"`,
    },
  });
}
