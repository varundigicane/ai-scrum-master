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
    if (!title || !rawNotes) {
      return { ok: false, error: "Title and notes are required." };
    }

    const note = await prisma.meetingNote.create({
      data: {
        companyId: session.user.companyId,
        createdById: session.user.id,
        title,
        attendees,
        rawNotes,
        accountId: String(formData.get("accountId") ?? "") || null,
        projectId: String(formData.get("projectId") ?? "") || null,
      },
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

    await prisma.meetingNote.update({
      where: { id },
      data: {
        title,
        attendees: String(formData.get("attendees") ?? note.attendees).trim(),
        rawNotes,
      },
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
