"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertFeature } from "@/lib/assert-feature";
import { ActionResult, toFriendlyError } from "@/lib/friendly-error";
import {
  generateFunctionalRequirementsAi,
  generateMeetingSummaryAi,
  generateProposalAi,
} from "@/lib/meeting-ai";
import type { RequirementKind, TaskKind } from "@/generated/prisma/enums";
import {
  composeMeetingLocation,
  provisionMeetingLinks,
} from "@/lib/meeting-providers";
import { createMeetingNoteRecord, updateMeetingNoteFields } from "@/lib/meeting-note-crm";
import type { MeetingNoteStatus } from "@/generated/prisma/enums";

function revalidateMeeting(id?: string) {
  revalidatePath("/dashboard/meeting-notes");
  if (id) revalidatePath(`/dashboard/meeting-notes/${id}`);
}

function notesBody(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  const text = raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text ? raw : "";
}

export async function createMeetingNote(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await assertFeature("meeting_notes");
    const title = String(formData.get("title") ?? "").trim();
    const attendees = String(formData.get("attendees") ?? "").trim();
    const rawNotes = notesBody(formData.get("rawNotes"));
    const templateKey = String(formData.get("templateKey") ?? "").trim() || null;
    if (!title && !templateKey) {
      return { ok: false, error: "Title and notes are required." };
    }
    if (!rawNotes && !templateKey) {
      return { ok: false, error: "Title and notes are required." };
    }

    const note = await createMeetingNoteRecord({
      companyId: session.user.companyId,
      createdById: session.user.id,
      title,
      attendees,
      rawNotes,
      accountId: String(formData.get("accountId") ?? "") || null,
      projectId: String(formData.get("projectId") ?? "") || null,
      templateKey,
    });
    revalidateMeeting(note.id);
    return { ok: true, data: { id: note.id }, message: "Meeting note saved." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function updateMeetingNote(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const id = String(formData.get("id") ?? "");
    const note = await prisma.meetingNote.findFirst({
      where: { id, companyId: session.user.companyId },
    });
    if (!note) return { ok: false, error: "Meeting note not found." };

    const title = String(formData.get("title") ?? note.title).trim();
    const rawNotes = notesBody(formData.get("rawNotes")) || note.rawNotes;
    if (!title || !notesBody(rawNotes)) {
      return { ok: false, error: "Title and notes are required." };
    }

    const statusRaw = String(formData.get("noteStatus") ?? note.noteStatus);
    const noteStatus = (["todo", "in_progress", "blocker", "done"].includes(statusRaw)
      ? statusRaw
      : note.noteStatus) as MeetingNoteStatus;
    const resourceIds = formData.getAll("resourceIds").map((v) => String(v));

    await updateMeetingNoteFields(session.user.companyId, id, {
      title,
      attendees: String(formData.get("attendees") ?? note.attendees).trim(),
      rawNotes,
      noteStatus,
      resourceIds: formData.has("resourceIds") ? resourceIds : undefined,
    });
    revalidateMeeting(id);
    return { ok: true, message: "Meeting note updated." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function generateMeetingSummaryAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const id = String(formData.get("id") ?? "");
    const note = await prisma.meetingNote.findFirst({
      where: { id, companyId: session.user.companyId },
    });
    if (!note) return { ok: false, error: "Meeting note not found." };

    const generated = await generateMeetingSummaryAi({
      title: note.title,
      attendees: note.attendees,
      rawNotes: note.rawNotes,
      companyId: session.user.companyId,
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
    revalidateMeeting(id);
    return { ok: true, message: "Summary generated." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function generateProposalAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const id = String(formData.get("id") ?? "");
    const note = await prisma.meetingNote.findFirst({
      where: { id, companyId: session.user.companyId },
      include: { summary: true },
    });
    if (!note) return { ok: false, error: "Meeting note not found." };
    if (!note.summary) {
      return { ok: false, error: "Generate a summary before creating a proposal." };
    }

    const generated = await generateProposalAi({
      title: note.title,
      summaryMd: note.summary.summaryMd,
      rawNotes: note.rawNotes,
      companyId: session.user.companyId,
    });

    await prisma.softwareProposal.upsert({
      where: { meetingNoteId: id },
      create: {
        companyId: session.user.companyId,
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
    revalidateMeeting(id);
    return { ok: true, message: "Software proposal draft created." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function saveProposalBody(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const proposalId = String(formData.get("proposalId") ?? "");
    const proposal = await prisma.softwareProposal.findFirst({
      where: { id: proposalId, companyId: session.user.companyId },
    });
    if (!proposal) return { ok: false, error: "Proposal not found." };

    await prisma.softwareProposal.update({
      where: { id: proposalId },
      data: {
        title: String(formData.get("title") ?? proposal.title).trim(),
        bodyHtml: String(formData.get("bodyHtml") ?? proposal.bodyHtml),
      },
    });
    revalidateMeeting(proposal.meetingNoteId ?? undefined);
    revalidatePath("/dashboard/meeting-notes");
    return { ok: true, message: "Proposal saved." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function generateFrsAction(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const proposalId = String(formData.get("proposalId") ?? "");
    const proposal = await prisma.softwareProposal.findFirst({
      where: { id: proposalId, companyId: session.user.companyId },
    });
    if (!proposal) return { ok: false, error: "Proposal not found." };

    const items = await generateFunctionalRequirementsAi({
      proposalTitle: proposal.title,
      bodyHtml: proposal.bodyHtml,
      companyId: session.user.companyId,
    });

    await prisma.$transaction([
      prisma.proposalRequirement.deleteMany({ where: { proposalId } }),
      prisma.proposalRequirement.createMany({
        data: items.map((item, sortOrder) => ({
          proposalId,
          title: item.title,
          description: item.description,
          priority: item.priority,
          kindHint: item.kindHint,
          parentTitle: item.parentTitle,
          sortOrder,
        })),
      }),
    ]);

    revalidateMeeting(proposal.meetingNoteId ?? undefined);
    return { ok: true, message: `Generated ${items.length} functional requirements.` };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function pushFrsToBacklog(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    await assertFeature("edit_delivery");

    const proposalId = String(formData.get("proposalId") ?? "");
    const projectId = String(formData.get("projectId") ?? "");
    const proposal = await prisma.softwareProposal.findFirst({
      where: { id: proposalId, companyId: session.user.companyId },
      include: { requirements: { orderBy: { sortOrder: "asc" } } },
    });
    if (!proposal) return { ok: false, error: "Proposal not found." };

    const project = await prisma.project.findFirst({
      where: { id: projectId, account: { companyId: session.user.companyId } },
    });
    if (!project) return { ok: false, error: "Select a valid project in your company." };

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

    for (const item of proposal.requirements) {
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
        const linkedRequirementId =
          parentReqId ??
          (item.parentTitle ? titleToRequirementId.get(item.parentTitle) : null) ??
          null;
        const createdTask = await prisma.task.create({
          data: {
            projectId,
            title: item.title,
            description: item.description,
            kind,
            parentId: kind === "subtask" ? parentTaskId : null,
            requirementId: linkedRequirementId,
            status: "todo",
            progressPct: 0,
          },
        });
        titleToTaskId.set(item.title, createdTask.id);
        created += 1;
      }
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/backlog`);
    revalidateMeeting(proposal.meetingNoteId ?? undefined);
    return {
      ok: true,
      message: `Pushed ${created} items to the project backlog. Existing data was not modified.`,
    };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function createMeetingEvent(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const title = String(formData.get("title") ?? "").trim();
    const startsAt = String(formData.get("startsAt") ?? "");
    const endsAt = String(formData.get("endsAt") ?? "");
    if (!title || !startsAt || !endsAt) {
      return { ok: false, error: "Title, start, and end are required for a meeting." };
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { ok: false, error: "Check the meeting start and end times." };
    }

    const meetingNoteId = String(formData.get("meetingNoteId") ?? "") || null;
    if (meetingNoteId) {
      const note = await prisma.meetingNote.findFirst({
        where: { id: meetingNoteId, companyId: session.user.companyId },
      });
      if (!note) return { ok: false, error: "Meeting note not found." };
    }

    const timezone = String(formData.get("timezone") ?? "Asia/Kolkata").trim() || "Asia/Kolkata";
    const attendees = String(formData.get("attendees") ?? "");
    const room = String(formData.get("room") ?? "").trim();
    const legacyLocation = String(formData.get("location") ?? "").trim();
    const pastedMeet = String(formData.get("googleMeetUrl") ?? "").trim();
    const pastedTeams = String(formData.get("teamsJoinUrl") ?? "").trim();
    const createGoogleMeet =
      formData.get("createGoogleMeet") === "on" || formData.get("createGoogleMeet") === "true";
    const createTeamsMeeting =
      formData.get("createTeamsMeeting") === "on" || formData.get("createTeamsMeeting") === "true";

    const provisioned = await provisionMeetingLinks({
      companyId: session.user.companyId,
      title,
      startsAt: start,
      endsAt: end,
      timezone,
      attendees,
      createGoogleMeet,
      createTeamsMeeting,
      pastedMeetUrl: pastedMeet,
      pastedTeamsUrl: pastedTeams,
    });

    const location =
      composeMeetingLocation({
        room: room || undefined,
        googleMeetUrl: provisioned.googleMeetUrl,
        teamsJoinUrl: provisioned.teamsJoinUrl,
      }) ||
      legacyLocation ||
      null;

    await prisma.meetingEvent.create({
      data: {
        companyId: session.user.companyId,
        meetingNoteId,
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

    revalidateMeeting(meetingNoteId ?? undefined);
    revalidatePath("/dashboard/meeting-notes");
    const warn =
      provisioned.warnings.length > 0 ? ` ${provisioned.warnings.join(" ")}` : "";
    return {
      ok: true,
      message: `Meeting scheduled. Use Download ICS on the event list.${warn}`,
    };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function addMeetingNoteComment(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const { addNoteComment } = await import("@/lib/meeting-note-crm");
    const noteId = String(formData.get("noteId") ?? "");
    await addNoteComment({
      companyId: session.user.companyId,
      noteId,
      authorUserId: session.user.id,
      body: String(formData.get("body") ?? ""),
    });
    revalidateMeeting(noteId);
    return { ok: true, message: "Comment added." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function addMeetingNoteReminder(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const { addNoteReminder } = await import("@/lib/meeting-note-crm");
    const noteId = String(formData.get("noteId") ?? "");
    const dueAt = new Date(String(formData.get("dueAt") ?? ""));
    if (Number.isNaN(dueAt.getTime())) return { ok: false, error: "Enter a valid due date/time." };
    await addNoteReminder({
      companyId: session.user.companyId,
      noteId,
      createdById: session.user.id,
      dueAt,
      note: String(formData.get("note") ?? ""),
    });
    revalidateMeeting(noteId);
    return { ok: true, message: "Reminder added." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}

export async function linkMeetingNote(formData: FormData): Promise<ActionResult> {
  try {
    const session = await assertFeature("meeting_notes");
    const { linkNotesByHeading } = await import("@/lib/meeting-note-crm");
    const fromNoteId = String(formData.get("fromNoteId") ?? "");
    await linkNotesByHeading({
      companyId: session.user.companyId,
      fromNoteId,
      toNoteId: String(formData.get("toNoteId") ?? ""),
      heading: String(formData.get("heading") ?? ""),
    });
    revalidateMeeting(fromNoteId);
    return { ok: true, message: "Note linked." };
  } catch (error) {
    return { ok: false, error: toFriendlyError(error) };
  }
}
