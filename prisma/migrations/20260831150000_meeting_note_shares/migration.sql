-- Additive: per-user shares for meeting note workflow (post-summary).
CREATE TABLE "MeetingNoteShare" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingNoteShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingNoteShare_noteId_userId_key" ON "MeetingNoteShare"("noteId", "userId");
CREATE INDEX "MeetingNoteShare_userId_idx" ON "MeetingNoteShare"("userId");

ALTER TABLE "MeetingNoteShare" ADD CONSTRAINT "MeetingNoteShare_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingNoteShare" ADD CONSTRAINT "MeetingNoteShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
