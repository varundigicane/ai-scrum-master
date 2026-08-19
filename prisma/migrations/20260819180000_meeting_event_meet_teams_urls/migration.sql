-- Additive only: Meet/Teams join URLs and Teams meeting id on MeetingEvent
ALTER TABLE "MeetingEvent" ADD COLUMN IF NOT EXISTS "googleMeetUrl" TEXT;
ALTER TABLE "MeetingEvent" ADD COLUMN IF NOT EXISTS "teamsJoinUrl" TEXT;
ALTER TABLE "MeetingEvent" ADD COLUMN IF NOT EXISTS "teamsMeetingId" TEXT;
