-- AlterTable
ALTER TABLE "Task" ADD COLUMN "estimateDays" REAL;
ALTER TABLE "Task" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Task" ADD COLUMN "endDate" DATETIME;

-- Backfill estimateDays from estimateHours (8h working day)
UPDATE "Task" SET "estimateDays" = "estimateHours" / 8.0 WHERE "estimateHours" IS NOT NULL AND "estimateDays" IS NULL;

-- CreateIndex
CREATE INDEX "Task_startDate_idx" ON "Task"("startDate");
CREATE INDEX "Task_endDate_idx" ON "Task"("endDate");
