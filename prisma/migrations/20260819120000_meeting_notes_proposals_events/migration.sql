-- Additive only: meeting notes, summaries, proposals, FRs, calendar events.
-- Does not alter or drop existing delivery tables.

CREATE TABLE "MeetingNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "accountId" TEXT,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "attendees" TEXT NOT NULL DEFAULT '',
    "rawNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingSummary" (
    "id" TEXT NOT NULL,
    "meetingNoteId" TEXT NOT NULL,
    "summaryMd" TEXT NOT NULL,
    "decisionsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SoftwareProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "meetingNoteId" TEXT,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposalRequirement" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'should',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kindHint" TEXT NOT NULL DEFAULT 'story',
    "parentTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "meetingNoteId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "attendees" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingNote_companyId_createdAt_idx" ON "MeetingNote"("companyId", "createdAt");
CREATE INDEX "MeetingNote_createdById_idx" ON "MeetingNote"("createdById");
CREATE UNIQUE INDEX "MeetingSummary_meetingNoteId_key" ON "MeetingSummary"("meetingNoteId");
CREATE UNIQUE INDEX "SoftwareProposal_meetingNoteId_key" ON "SoftwareProposal"("meetingNoteId");
CREATE INDEX "SoftwareProposal_companyId_createdAt_idx" ON "SoftwareProposal"("companyId", "createdAt");
CREATE INDEX "ProposalRequirement_proposalId_sortOrder_idx" ON "ProposalRequirement"("proposalId", "sortOrder");
CREATE INDEX "MeetingEvent_companyId_startsAt_idx" ON "MeetingEvent"("companyId", "startsAt");

ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingSummary" ADD CONSTRAINT "MeetingSummary_meetingNoteId_fkey" FOREIGN KEY ("meetingNoteId") REFERENCES "MeetingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareProposal" ADD CONSTRAINT "SoftwareProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareProposal" ADD CONSTRAINT "SoftwareProposal_meetingNoteId_fkey" FOREIGN KEY ("meetingNoteId") REFERENCES "MeetingNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposalRequirement" ADD CONSTRAINT "ProposalRequirement_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SoftwareProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_meetingNoteId_fkey" FOREIGN KEY ("meetingNoteId") REFERENCES "MeetingNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
