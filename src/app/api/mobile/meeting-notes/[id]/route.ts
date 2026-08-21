import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import {
  generateFunctionalRequirementsAi,
  generateMeetingSummaryAi,
  generateProposalAi,
} from "@/lib/meeting-ai";
import {
  composeMeetingLocation,
  provisionMeetingLinks,
} from "@/lib/meeting-providers";
import { hasFeature } from "@/lib/permissions";
import type { MeetingNoteStatus, RequirementKind, TaskKind } from "@/generated/prisma/enums";
import {
  addNoteComment,
  addNoteReminder,
  completeNoteReminder,
  getMeetingNoteDetail,
  linkNotesByHeading,
  noteToMarkdown,
  updateMeetingNoteFields,
} from "@/lib/meeting-note-crm";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "md") {
      const note = await getMeetingNoteDetail(payload.companyId, id);
      if (!note) return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });
      const md = noteToMarkdown(note);
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${note.functionalId ?? note.id}.md"`,
        },
      });
    }
    const note = await getMeetingNoteDetail(payload.companyId, id);
    if (!note) return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });
    const resources = await prisma.resource.findMany({
      where: { companyId: payload.companyId, active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    const otherNotes = await prisma.meetingNote.findMany({
      where: { companyId: payload.companyId, NOT: { id } },
      select: { id: true, title: true, functionalId: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ note, resources, otherNotes });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      title?: string;
      attendees?: string;
      rawNotes?: string;
      noteStatus?: MeetingNoteStatus;
      resourceIds?: string[];
    };
    const updated = await updateMeetingNoteFields(payload.companyId, id, {
      title: body.title,
      attendees: body.attendees,
      rawNotes: body.rawNotes,
      noteStatus: body.noteStatus,
      resourceIds: body.resourceIds,
    });
    return NextResponse.json({ note: updated, message: "Meeting note updated." });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

/** Shared by `?action=` and dedicated `/summary|/proposal|/frs|/push-backlog|/events` routes. */
export async function postMeetingNoteAction(req: Request, ctx: Ctx, actionOverride?: string) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const action = actionOverride ?? url.searchParams.get("action") ?? "";
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const note = await prisma.meetingNote.findFirst({
      where: { id, companyId: payload.companyId },
      include: {
        summary: true,
        proposal: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!note) return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });

    if (action === "summary") {
      const generated = await generateMeetingSummaryAi({
        title: note.title,
        attendees: note.attendees,
        rawNotes: note.rawNotes,
        companyId: payload.companyId,
      });
      await prisma.meetingSummary.upsert({
        where: { meetingNoteId: id },
        create: {
          meetingNoteId: id,
          summaryMd: generated.summaryMd,
          decisionsJson: JSON.stringify({
            decisions: generated.decisions,
            actionItems: generated.actionItems,
          }),
        },
        update: {
          summaryMd: generated.summaryMd,
          decisionsJson: JSON.stringify({
            decisions: generated.decisions,
            actionItems: generated.actionItems,
          }),
        },
      });
      return NextResponse.json({ message: "Summary generated." });
    }

    if (action === "proposal") {
      if (!note.summary) {
        return NextResponse.json({ error: "Generate a summary before creating a proposal." }, { status: 400 });
      }
      const generated = await generateProposalAi({
        title: note.title,
        summaryMd: note.summary.summaryMd,
        rawNotes: note.rawNotes,
        companyId: payload.companyId,
      });
      await prisma.softwareProposal.upsert({
        where: { meetingNoteId: id },
        create: {
          companyId: payload.companyId,
          meetingNoteId: id,
          title: generated.title,
          bodyHtml: generated.bodyHtml,
          status: "draft",
        },
        update: {
          title: generated.title,
          bodyHtml: generated.bodyHtml,
        },
      });
      return NextResponse.json({ message: "Software proposal draft created." });
    }

    if (action === "save-proposal") {
      if (!note.proposal) {
        return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
      }
      await prisma.softwareProposal.update({
        where: { id: note.proposal.id },
        data: {
          title: String(body.title ?? note.proposal.title).trim(),
          bodyHtml: String(body.bodyHtml ?? note.proposal.bodyHtml),
        },
      });
      return NextResponse.json({ message: "Proposal saved." });
    }

    if (action === "frs") {
      if (!note.proposal) {
        return NextResponse.json({ error: "Create a proposal before generating FRs." }, { status: 400 });
      }
      const items = await generateFunctionalRequirementsAi({
        proposalTitle: note.proposal.title,
        bodyHtml: note.proposal.bodyHtml,
        companyId: payload.companyId,
      });
      await prisma.$transaction([
        prisma.proposalRequirement.deleteMany({ where: { proposalId: note.proposal.id } }),
        prisma.proposalRequirement.createMany({
          data: items.map((item, sortOrder) => ({
            proposalId: note.proposal!.id,
            title: item.title,
            description: item.description,
            priority: item.priority,
            kindHint: item.kindHint,
            parentTitle: item.parentTitle,
            sortOrder,
          })),
        }),
      ]);
      return NextResponse.json({ message: `Generated ${items.length} functional requirements.` });
    }

    if (action === "push-backlog") {
      const canEdit = await hasFeature(payload.companyId, payload.role, "edit_delivery");
      if (!canEdit) {
        return NextResponse.json(
          { error: "You do not have permission to do that. Ask a Company Admin to update Feature access." },
          { status: 403 },
        );
      }
      if (!note.proposal) {
        return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
      }
      const projectId = String(body.projectId ?? "");
      const project = await prisma.project.findFirst({
        where: { id: projectId, account: { companyId: payload.companyId } },
      });
      if (!project) {
        return NextResponse.json({ error: "Select a valid project in your company." }, { status: 400 });
      }

      const requirements = await prisma.proposalRequirement.findMany({
        where: { proposalId: note.proposal.id },
        orderBy: { sortOrder: "asc" },
      });

      const reqKindMap: Record<string, RequirementKind> = {
        epic: "epic",
        feature: "feature",
        story: "story",
      };
      const taskKindMap: Record<string, TaskKind> = {
        task: "task",
        subtask: "subtask",
      };

      const titleToRequirementId = new Map<string, string>();
      const titleToTaskId = new Map<string, string>();
      let created = 0;

      for (const item of requirements) {
        const parentReqId = item.parentTitle
          ? titleToRequirementId.get(item.parentTitle) ?? null
          : null;
        const parentTaskId = item.parentTitle ? titleToTaskId.get(item.parentTitle) ?? null : null;

        if (reqKindMap[item.kindHint]) {
          const createdReq = await prisma.requirement.create({
            data: {
              projectId,
              title: item.title,
              description: item.description,
              kind: reqKindMap[item.kindHint],
              parentId: parentReqId,
            },
          });
          titleToRequirementId.set(item.title, createdReq.id);
          created += 1;
        } else {
          const kind = taskKindMap[item.kindHint] ?? "task";
          const createdTask = await prisma.task.create({
            data: {
              projectId,
              title: item.title,
              description: item.description,
              kind,
              parentId: kind === "subtask" ? parentTaskId : null,
              requirementId: parentReqId,
              status: "todo",
              progressPct: 0,
            },
          });
          titleToTaskId.set(item.title, createdTask.id);
          created += 1;
        }
      }

      return NextResponse.json({
        message: `Pushed ${created} items to the project backlog. Existing data was not modified.`,
      });
    }

    if (action === "events") {
      const title = String(body.title ?? note.title).trim();
      const startsAt = String(body.startsAt ?? "");
      const endsAt = String(body.endsAt ?? "");
      if (!title || !startsAt || !endsAt) {
        return NextResponse.json({ error: "Title, start, and end are required for a meeting." }, { status: 400 });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return NextResponse.json({ error: "Check the meeting start and end times." }, { status: 400 });
      }

      const timezone = String(body.timezone ?? "Asia/Kolkata").trim() || "Asia/Kolkata";
      const attendees = String(body.attendees ?? note.attendees ?? "");
      const room = String(body.room ?? "").trim();
      const provisioned = await provisionMeetingLinks({
        companyId: payload.companyId,
        title,
        startsAt: start,
        endsAt: end,
        timezone,
        attendees,
        createGoogleMeet: Boolean(body.createGoogleMeet),
        createTeamsMeeting: Boolean(body.createTeamsMeeting),
        pastedMeetUrl: String(body.googleMeetUrl ?? ""),
        pastedTeamsUrl: String(body.teamsJoinUrl ?? ""),
      });

      const location =
        composeMeetingLocation({
          room: room || undefined,
          googleMeetUrl: provisioned.googleMeetUrl,
          teamsJoinUrl: provisioned.teamsJoinUrl,
        }) || String(body.location ?? "").trim() || null;

      const event = await prisma.meetingEvent.create({
        data: {
          companyId: payload.companyId,
          meetingNoteId: id,
          title,
          startsAt: start,
          endsAt: end,
          timezone,
          attendees,
          location,
          googleEventId: provisioned.googleEventId ?? null,
          googleMeetUrl: provisioned.googleMeetUrl ?? null,
          teamsJoinUrl: provisioned.teamsJoinUrl ?? null,
          teamsMeetingId: provisioned.teamsMeetingId ?? null,
        },
      });

      return NextResponse.json({
        event,
        message: `Meeting scheduled.${provisioned.warnings.length ? ` ${provisioned.warnings.join(" ")}` : ""}`,
      });
    }

    if (action === "comment") {
      const comment = await addNoteComment({
        companyId: payload.companyId,
        noteId: id,
        authorUserId: payload.sub,
        body: String(body.body ?? ""),
      });
      return NextResponse.json({ comment, message: "Comment added." });
    }

    if (action === "reminder") {
      const dueAt = new Date(String(body.dueAt ?? ""));
      if (Number.isNaN(dueAt.getTime())) {
        return NextResponse.json({ error: "Enter a valid due date/time." }, { status: 400 });
      }
      const reminder = await addNoteReminder({
        companyId: payload.companyId,
        noteId: id,
        createdById: payload.sub,
        dueAt,
        note: String(body.note ?? ""),
      });
      return NextResponse.json({ reminder, message: "Reminder added." });
    }

    if (action === "complete-reminder") {
      const reminderId = String(body.reminderId ?? "");
      if (!reminderId) {
        return NextResponse.json({ error: "reminderId required." }, { status: 400 });
      }
      const reminder = await completeNoteReminder({
        companyId: payload.companyId,
        noteId: id,
        reminderId,
      });
      return NextResponse.json({ reminder, message: "Reminder marked done." });
    }

    if (action === "link") {
      const link = await linkNotesByHeading({
        companyId: payload.companyId,
        fromNoteId: id,
        toNoteId: String(body.toNoteId ?? ""),
        heading: String(body.heading ?? ""),
      });
      return NextResponse.json({ link, message: "Note linked." });
    }

    if (action === "export-md") {
      const full = await getMeetingNoteDetail(payload.companyId, id);
      if (!full) return NextResponse.json({ error: "Meeting note not found." }, { status: 404 });
      return NextResponse.json({ markdown: noteToMarkdown(full) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  return postMeetingNoteAction(req, ctx);
}
