import { prisma } from "@/lib/prisma";
import { allocateMeetingNoteFunctionalId } from "@/lib/meeting-note-id";
import { resolveTemplate } from "@/lib/meeting-note-templates";
import type { MeetingNoteStatus } from "@/generated/prisma/enums";
import { cacheInvalidatePrefix } from "@/lib/memory-cache";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const NOTE_INCLUDE = {
  summary: { select: { id: true } },
  proposal: { select: { id: true } },
  assignments: { include: { resource: { select: { id: true, name: true, email: true } } } },
  reminders: { orderBy: { dueAt: "asc" as const } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: { id: true, name: true } },
      attachments: true,
    },
  },
  linksFrom: {
    include: { toNote: { select: { id: true, title: true, functionalId: true } } },
  },
} as const;

export function invalidateNotesCache(companyId: string) {
  cacheInvalidatePrefix(`${companyId}:meeting-notes`);
  cacheInvalidatePrefix(`${companyId}:menu-data`);
}

export async function createMeetingNoteRecord(input: {
  companyId: string;
  createdById: string;
  title: string;
  attendees?: string;
  rawNotes: string;
  accountId?: string | null;
  projectId?: string | null;
  templateKey?: string | null;
  noteStatus?: MeetingNoteStatus;
}) {
  const template = resolveTemplate(input.templateKey);
  const title =
    input.title.trim() ||
    (template ? `${template.titlePrefix} ${new Date().toISOString().slice(0, 10)}` : "");
  const rawNotes = input.rawNotes.trim() || template?.bodyHtml || "";
  if (!title || !rawNotes) throw new Error("Title and notes are required.");

  const note = await prisma.$transaction(async (tx) => {
    const functionalId = await allocateMeetingNoteFunctionalId(tx, input.companyId);
    return tx.meetingNote.create({
      data: {
        companyId: input.companyId,
        createdById: input.createdById,
        title,
        attendees: input.attendees?.trim() ?? "",
        rawNotes,
        accountId: input.accountId || null,
        projectId: input.projectId || null,
        templateKey: template ? input.templateKey : null,
        functionalId,
        noteStatus: input.noteStatus ?? "todo",
      },
    });
  });
  invalidateNotesCache(input.companyId);
  return note;
}

export async function getMeetingNoteDetail(companyId: string, id: string) {
  return prisma.meetingNote.findFirst({
    where: { id, companyId },
    include: {
      summary: true,
      proposal: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
      events: { orderBy: { startsAt: "asc" } },
      assignments: { include: { resource: { select: { id: true, name: true, email: true } } } },
      reminders: { orderBy: { dueAt: "asc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true } },
          attachments: true,
        },
      },
      linksFrom: {
        include: { toNote: { select: { id: true, title: true, functionalId: true } } },
      },
      linksTo: {
        include: { fromNote: { select: { id: true, title: true, functionalId: true } } },
      },
    },
  });
}

export async function searchMeetingNotes(companyId: string, q: string, take = 50) {
  const term = q.trim();
  if (!term) {
    return prisma.meetingNote.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        title: true,
        functionalId: true,
        noteStatus: true,
        attendees: true,
        createdAt: true,
        updatedAt: true,
        summary: { select: { id: true } },
        proposal: { select: { id: true } },
      },
    });
  }
  return prisma.meetingNote.findMany({
    where: {
      companyId,
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { functionalId: { contains: term, mode: "insensitive" } },
        { rawNotes: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      functionalId: true,
      noteStatus: true,
      attendees: true,
      createdAt: true,
      updatedAt: true,
      summary: { select: { id: true } },
      proposal: { select: { id: true } },
    },
  });
}

export async function updateMeetingNoteFields(
  companyId: string,
  id: string,
  patch: {
    title?: string;
    attendees?: string;
    rawNotes?: string;
    noteStatus?: MeetingNoteStatus;
    resourceIds?: string[];
  },
) {
  const note = await prisma.meetingNote.findFirst({ where: { id, companyId } });
  if (!note) throw new Error("Meeting note not found.");

  const title = (patch.title ?? note.title).trim();
  const rawNotes = (patch.rawNotes ?? note.rawNotes).trim();
  if (!title || !rawNotes) throw new Error("Title and notes are required.");

  await prisma.$transaction(async (tx) => {
    await tx.meetingNote.update({
      where: { id },
      data: {
        title,
        attendees: patch.attendees !== undefined ? patch.attendees.trim() : note.attendees,
        rawNotes,
        ...(patch.noteStatus ? { noteStatus: patch.noteStatus } : {}),
      },
    });
    if (patch.resourceIds) {
      const ids = [...new Set(patch.resourceIds.filter(Boolean))];
      await tx.meetingNoteAssignment.deleteMany({ where: { noteId: id } });
      if (ids.length) {
        const resources = await tx.resource.findMany({
          where: { companyId, id: { in: ids }, active: true },
          select: { id: true },
        });
        await tx.meetingNoteAssignment.createMany({
          data: resources.map((r) => ({ noteId: id, resourceId: r.id })),
        });
      }
    }
  });
  invalidateNotesCache(companyId);
  return getMeetingNoteDetail(companyId, id);
}

export async function addNoteComment(input: {
  companyId: string;
  noteId: string;
  authorUserId: string;
  body: string;
}) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: input.noteId, companyId: input.companyId },
  });
  if (!note) throw new Error("Meeting note not found.");
  const body = input.body.trim();
  if (!body) throw new Error("Comment cannot be empty.");
  const comment = await prisma.meetingNoteComment.create({
    data: { noteId: input.noteId, authorUserId: input.authorUserId, body },
    include: { author: { select: { id: true, name: true } }, attachments: true },
  });
  invalidateNotesCache(input.companyId);
  return comment;
}

export async function addNoteReminder(input: {
  companyId: string;
  noteId: string;
  createdById: string;
  dueAt: Date;
  note?: string;
}) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: input.noteId, companyId: input.companyId },
  });
  if (!note) throw new Error("Meeting note not found.");
  const reminder = await prisma.meetingNoteReminder.create({
    data: {
      noteId: input.noteId,
      createdById: input.createdById,
      dueAt: input.dueAt,
      note: input.note?.trim() ?? "",
    },
  });
  invalidateNotesCache(input.companyId);
  return reminder;
}

export async function linkNotesByHeading(input: {
  companyId: string;
  fromNoteId: string;
  toNoteId: string;
  heading: string;
}) {
  if (input.fromNoteId === input.toNoteId) throw new Error("Cannot link a note to itself.");
  const [from, to] = await Promise.all([
    prisma.meetingNote.findFirst({ where: { id: input.fromNoteId, companyId: input.companyId } }),
    prisma.meetingNote.findFirst({ where: { id: input.toNoteId, companyId: input.companyId } }),
  ]);
  if (!from || !to) throw new Error("Meeting note not found.");
  const link = await prisma.meetingNoteLink.upsert({
    where: {
      fromNoteId_toNoteId_heading: {
        fromNoteId: input.fromNoteId,
        toNoteId: input.toNoteId,
        heading: input.heading.trim(),
      },
    },
    create: {
      fromNoteId: input.fromNoteId,
      toNoteId: input.toNoteId,
      heading: input.heading.trim(),
    },
    update: {},
  });
  invalidateNotesCache(input.companyId);
  return link;
}

export async function saveCommentImage(input: {
  companyId: string;
  commentId: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(input.mimeType)) throw new Error("Only JPEG, PNG, or WebP images are allowed.");
  if (input.buffer.length > 5 * 1024 * 1024) throw new Error("Image must be under 5MB.");

  const comment = await prisma.meetingNoteComment.findFirst({
    where: { id: input.commentId, meetingNote: { companyId: input.companyId } },
  });
  if (!comment) throw new Error("Comment not found.");

  const dir = path.join(process.cwd(), "uploads", "note-comments", input.companyId);
  await mkdir(dir, { recursive: true });
  const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `${input.commentId}-${Date.now()}.${ext}`;
  const full = path.join(dir, filename);
  await writeFile(full, input.buffer);
  const storageKey = `note-comments/${input.companyId}/${filename}`;

  const att = await prisma.meetingNoteCommentAttachment.create({
    data: {
      commentId: input.commentId,
      storageKey,
      mimeType: input.mimeType,
      byteSize: input.buffer.length,
    },
  });
  invalidateNotesCache(input.companyId);
  return att;
}

export function noteToMarkdown(note: {
  functionalId?: string | null;
  title: string;
  noteStatus?: string | null;
  attendees?: string | null;
  rawNotes: string;
  createdAt: Date;
  updatedAt: Date;
  comments?: Array<{ author: { name: string }; body: string; createdAt: Date }>;
}) {
  const plain = note.rawNotes
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  const lines = [
    `# ${note.functionalId ? `${note.functionalId} · ` : ""}${note.title}`,
    "",
    `- Status: ${note.noteStatus ?? "todo"}`,
    `- Created: ${note.createdAt.toISOString()}`,
    `- Updated: ${note.updatedAt.toISOString()}`,
    `- Attendees: ${note.attendees || "—"}`,
    "",
    "## Notes",
    "",
    plain,
  ];
  if (note.comments?.length) {
    lines.push("", "## Comments", "");
    for (const c of note.comments) {
      lines.push(`- **${c.author.name}** (${c.createdAt.toISOString()}): ${c.body}`);
    }
  }
  return lines.join("\n");
}

export { NOTE_INCLUDE };
