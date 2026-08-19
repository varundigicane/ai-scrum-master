import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";

/** Lightweight HTML→printable PDF via browser print stylesheet (application/pdf alternative: HTML download). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const allowed = await hasFeature(session.user.companyId, session.user.role, "meeting_notes");
  if (!allowed) return NextResponse.json({ error: "You do not have access to proposals." }, { status: 403 });

  const { id } = await ctx.params;
  const proposal = await prisma.softwareProposal.findFirst({
    where: { id, companyId: session.user.companyId },
  });
  if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(proposal.title)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; color: #0f2740; line-height: 1.5; }
    h1 { font-size: 1.6rem; }
    @media print { body { margin: 0; } .noprint { display: none; } }
  </style>
</head>
<body>
  <p class="noprint"><button onclick="window.print()">Print / Save as PDF</button></p>
  <h1>${escapeHtml(proposal.title)}</h1>
  <p><small>Status: ${escapeHtml(proposal.status)} · Updated ${proposal.updatedAt.toISOString()}</small></p>
  <hr />
  ${sanitizeBasicHtml(proposal.bodyHtml)}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="proposal-${proposal.id}.html"`,
    },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeBasicHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}
