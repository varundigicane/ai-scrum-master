-- AlterTable
ALTER TABLE "Project" ADD COLUMN "workItemSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "displayId" TEXT;

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "displayId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_displayId_key" ON "Task"("projectId", "displayId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_projectId_displayId_key" ON "Requirement"("projectId", "displayId");
