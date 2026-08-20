-- CreateEnum
CREATE TYPE "MeetingNoteStatus" AS ENUM ('todo', 'in_progress', 'blocker', 'done');

-- AlterTable Company
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "meetingNoteIdPrefix" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "meetingNoteSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable MeetingNote
ALTER TABLE "MeetingNote" ADD COLUMN IF NOT EXISTS "functionalId" TEXT;
ALTER TABLE "MeetingNote" ADD COLUMN IF NOT EXISTS "noteStatus" "MeetingNoteStatus" NOT NULL DEFAULT 'todo';
ALTER TABLE "MeetingNote" ADD COLUMN IF NOT EXISTS "templateKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingNote_companyId_functionalId_key" ON "MeetingNote"("companyId", "functionalId");
CREATE INDEX IF NOT EXISTS "MeetingNote_companyId_noteStatus_idx" ON "MeetingNote"("companyId", "noteStatus");

CREATE TABLE IF NOT EXISTS "MeetingNoteLink" (
    "id" TEXT NOT NULL,
    "fromNoteId" TEXT NOT NULL,
    "toNoteId" TEXT NOT NULL,
    "heading" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNoteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingNoteLink_fromNoteId_toNoteId_heading_key" ON "MeetingNoteLink"("fromNoteId", "toNoteId", "heading");
CREATE INDEX IF NOT EXISTS "MeetingNoteLink_toNoteId_idx" ON "MeetingNoteLink"("toNoteId");

CREATE TABLE IF NOT EXISTS "MeetingNoteReminder" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNoteReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingNoteReminder_noteId_dueAt_idx" ON "MeetingNoteReminder"("noteId", "dueAt");
CREATE INDEX IF NOT EXISTS "MeetingNoteReminder_dueAt_done_idx" ON "MeetingNoteReminder"("dueAt", "done");

CREATE TABLE IF NOT EXISTS "MeetingNoteAssignment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNoteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingNoteAssignment_noteId_resourceId_key" ON "MeetingNoteAssignment"("noteId", "resourceId");
CREATE INDEX IF NOT EXISTS "MeetingNoteAssignment_resourceId_idx" ON "MeetingNoteAssignment"("resourceId");

CREATE TABLE IF NOT EXISTS "MeetingNoteComment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNoteComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingNoteComment_noteId_createdAt_idx" ON "MeetingNoteComment"("noteId", "createdAt");

CREATE TABLE IF NOT EXISTS "MeetingNoteCommentAttachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingNoteCommentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingNoteCommentAttachment_commentId_idx" ON "MeetingNoteCommentAttachment"("commentId");

DO $$ BEGIN
  ALTER TABLE "MeetingNoteLink" ADD CONSTRAINT "MeetingNoteLink_fromNoteId_fkey" FOREIGN KEY ("fromNoteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteLink" ADD CONSTRAINT "MeetingNoteLink_toNoteId_fkey" FOREIGN KEY ("toNoteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteReminder" ADD CONSTRAINT "MeetingNoteReminder_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteReminder" ADD CONSTRAINT "MeetingNoteReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteAssignment" ADD CONSTRAINT "MeetingNoteAssignment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteAssignment" ADD CONSTRAINT "MeetingNoteAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteComment" ADD CONSTRAINT "MeetingNoteComment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteComment" ADD CONSTRAINT "MeetingNoteComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MeetingNoteCommentAttachment" ADD CONSTRAINT "MeetingNoteCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "MeetingNoteComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
