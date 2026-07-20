-- AlterTable
ALTER TABLE "Project" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "employeeId" TEXT;

-- AlterTable
ALTER TABLE "ResourceAssignment" ADD COLUMN "hourlyRate" REAL NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ExtraWorkingDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtraWorkingDay_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExtraWorkingDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingMonthOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalWorkingDays" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingMonthOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Resource_companyId_employeeId_idx" ON "Resource"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraWorkingDay_resourceId_projectId_date_key" ON "ExtraWorkingDay"("resourceId", "projectId", "date");

-- CreateIndex
CREATE INDEX "ExtraWorkingDay_resourceId_date_idx" ON "ExtraWorkingDay"("resourceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BillingMonthOverride_companyId_year_month_key" ON "BillingMonthOverride"("companyId", "year", "month");
