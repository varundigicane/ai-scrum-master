import { prisma } from "@/lib/prisma";
import { allocateMeetingNoteFunctionalId } from "@/lib/meeting-note-id";
import { resolveTemplate } from "@/lib/meeting-note-templates";
import type { MeetingNoteStatus } from "@/generated/prisma/enums";
import { cacheInvalidatePrefix } from "@/lib/memory-cache";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@/generated/prisma/client";

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
  shares: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
} as const;

export function invalidateNotesCache(companyId: string, userId?: string) {
  cacheInvalidatePrefix(`${companyId}:meeting-notes`);
  cacheInvalidatePrefix(`${companyId}:menu-data`);
  cacheInvalidatePrefix(`${companyId}:me`);
  if (userId) cacheInvalidatePrefix(`${companyId}:meeting-notes:${userId}`);
}

/** Owner always; shared user only when a summary exists. */
export function accessibleNoteWhere(userId: string): Prisma.MeetingNoteWhereInput {
  return {
    OR: [
      { createdById: userId },
      {
        AND: [{ shares: { some: { userId } } }, { summary: { isNot: null } }],
      },
    ],
  };
}

export async function isNoteOwner(companyId: string, userId: string, noteId: string) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: noteId, companyId, createdById: userId },
    select: { id: true },
  });
  return Boolean(note);
}

export async function canAccessNote(companyId: string, userId: string, noteId: string) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: noteId, companyId, ...accessibleNoteWhere(userId) },
    select: { id: true, createdById: true },
  });
  return note;
}

export async function requireAccessibleNote(companyId: string, userId: string, noteId: string) {
  const note = await canAccessNote(companyId, userId, noteId);
  if (!note) throw new Error("Meeting note not found.");
  return note;
}

export async function requireOwnedNote(companyId: string, userId: string, noteId: string) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: noteId, companyId, createdById: userId },
  });
  if (!note) throw new Error("Meeting note not found.");
  return note;
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
  invalidateNotesCache(input.companyId, input.createdById);
  return note;
}

export async function getMeetingNoteDetail(companyId: string, userId: string, id: string) {
  const note = await prisma.meetingNote.findFirst({
    where: { id, companyId, ...accessibleNoteWhere(userId) },
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
      shares: {
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
      },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!note) return null;
  const isOwner = note.createdById === userId;
  if (!isOwner) {
    return { ...note, rawNotes: "", isOwner: false as const, isShared: true as const };
  }
  return { ...note, isOwner: true as const, isShared: false as const };
}

export async function searchMeetingNotes(companyId: string, userId: string, q: string, take = 50) {
  const term = q.trim();
  const access = accessibleNoteWhere(userId);
  const listSelect = {
    id: true,
    title: true,
    functionalId: true,
    noteStatus: true,
    attendees: true,
    createdAt: true,
    updatedAt: true,
    createdById: true,
    summary: { select: { id: true } },
    proposal: { select: { id: true } },
  } as const;

  if (!term) {
    return prisma.meetingNote.findMany({
      where: { companyId, ...access },
      orderBy: { updatedAt: "desc" },
      take,
      select: listSelect,
    });
  }

  return prisma.meetingNote.findMany({
    where: {
      companyId,
      AND: [
        access,
        {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { functionalId: { contains: term, mode: "insensitive" } },
            // Raw-notes search only for own notes (never leak private body matches to sharers).
            { createdById: userId, rawNotes: { contains: term, mode: "insensitive" } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: listSelect,
  });
}

export async function setNoteShares(input: {
  companyId: string;
  noteId: string;
  ownerUserId: string;
  userIds: string[];
}) {
  const note = await prisma.meetingNote.findFirst({
    where: { id: input.noteId, companyId: input.companyId, createdById: input.ownerUserId },
    include: { summary: { select: { id: true } } },
  });
  if (!note) throw new Error("Meeting note not found.");
  if (!note.summary) {
    throw new Error("Generate a summary before sharing this note.");
  }

  const unique = [...new Set(input.userIds.filter((id) => id && id !== input.ownerUserId))];
  const users = unique.length
    ? await prisma.user.findMany({
        where: { companyId: input.companyId, id: { in: unique }, active: true },
        select: { id: true },
      })
    : [];
  const allowed = new Set(users.map((u) => u.id));

  await prisma.$transaction(async (tx) => {
    await tx.meetingNoteShare.deleteMany({ where: { noteId: input.noteId } });
    if (allowed.size) {
      await tx.meetingNoteShare.createMany({
        data: [...allowed].map((userId) => ({ noteId: input.noteId, userId })),
      });
    }
  });
  invalidateNotesCache(input.companyId, input.ownerUserId);
  return prisma.meetingNoteShare.findMany({
    where: { noteId: input.noteId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function updateMeetingNoteFields(
  companyId: string,
  userId: string,
  id: string,
  patch: {
    title?: string;
    attendees?: string;
    rawNotes?: string;
    noteStatus?: MeetingNoteStatus;
    resourceIds?: string[];
  },
) {
  // Raw notes / title edits require ownership.
  const note = await requireOwnedNote(companyId, userId, id);

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
  invalidateNotesCache(companyId, userId);
  return getMeetingNoteDetail(companyId, userId, id);
}

export async function addNoteComment(input: {
  companyId: string;
  noteId: string;
  authorUserId: string;
  body: string;
}) {
  await requireAccessibleNote(input.companyId, input.authorUserId, input.noteId);
  const body = input.body.trim();
  if (!body) throw new Error("Comment cannot be empty.");
  const comment = await prisma.meetingNoteComment.create({
    data: { noteId: input.noteId, authorUserId: input.authorUserId, body },
    include: { author: { select: { id: true, name: true } }, attachments: true },
  });
  invalidateNotesCache(input.companyId, input.authorUserId);
  return comment;
}

export async function addNoteReminder(input: {
  companyId: string;
  noteId: string;
  createdById: string;
  dueAt: Date;
  note?: string;
}) {
  await requireAccessibleNote(input.companyId, input.createdById, input.noteId);
  const reminder = await prisma.meetingNoteReminder.create({
    data: {
      noteId: input.noteId,
      createdById: input.createdById,
      dueAt: input.dueAt,
      note: input.note?.trim() ?? "",
    },
  });
  invalidateNotesCache(input.companyId, input.createdById);
  return reminder;
}

export async function completeNoteReminder(input: {
  companyId: string;
  noteId: string;
  reminderId: string;
  userId: string;
}) {
  await requireAccessibleNote(input.companyId, input.userId, input.noteId);
  const reminder = await prisma.meetingNoteReminder.findFirst({
    where: {
      id: input.reminderId,
      noteId: input.noteId,
      createdById: input.userId,
      meetingNote: { companyId: input.companyId },
    },
  });
  if (!reminder) throw new Error("Reminder not found.");
  const updated = await prisma.meetingNoteReminder.update({
    where: { id: reminder.id },
    data: { done: true },
  });
  invalidateNotesCache(input.companyId, input.userId);
  return updated;
}

export async function linkNotesByHeading(input: {
  companyId: string;
  userId: string;
  fromNoteId: string;
  toNoteId: string;
  heading: string;
}) {
  if (input.fromNoteId === input.toNoteId) throw new Error("Cannot link a note to itself.");
  await Promise.all([
    requireAccessibleNote(input.companyId, input.userId, input.fromNoteId),
    requireAccessibleNote(input.companyId, input.userId, input.toNoteId),
  ]);
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
  invalidateNotesCache(input.companyId, input.userId);
  return link;
}

export async function saveCommentImage(input: {
  companyId: string;
  userId: string;
  commentId: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(input.mimeType)) throw new Error("Only JPEG, PNG, or WebP images are allowed.");
  if (input.buffer.length > 5 * 1024 * 1024) throw new Error("Image must be under 5MB.");

  const comment = await prisma.meetingNoteComment.findFirst({
    where: {
      id: input.commentId,
      meetingNote: { companyId: input.companyId, ...accessibleNoteWhere(input.userId) },
    },
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
  invalidateNotesCache(input.companyId, input.userId);
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
    plain || "_(private — visible to creator only)_",
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
