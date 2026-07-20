-- AlterTable Account GTS header fields
ALTER TABLE "Account" ADD COLUMN "technology" TEXT;
ALTER TABLE "Account" ADD COLUMN "domain" TEXT;
ALTER TABLE "Account" ADD COLUMN "projectManagers" TEXT;

-- CreateTable
CREATE TABLE "GtsMonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "projectName" TEXT,
    "projectManagers" TEXT,
    "technology" TEXT,
    "domain" TEXT,
    "utilizationPct" REAL,
    "availabilityPct" REAL,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GtsMonthlyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GtsMonthlyReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtsMonthlyLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "subProjectName" TEXT NOT NULL,
    "featureName" TEXT NOT NULL DEFAULT '',
    "uatDefects" INTEGER NOT NULL DEFAULT 0,
    "actualEffortHrs" REAL NOT NULL DEFAULT 0,
    "remarks" TEXT,
    CONSTRAINT "GtsMonthlyLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "GtsMonthlyReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GtsMonthlyLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GtsMonthlyReport_accountId_year_month_key" ON "GtsMonthlyReport"("accountId", "year", "month");
CREATE INDEX "GtsMonthlyReport_companyId_year_month_idx" ON "GtsMonthlyReport"("companyId", "year", "month");
CREATE INDEX "GtsMonthlyLine_reportId_idx" ON "GtsMonthlyLine"("reportId");
CREATE INDEX "GtsMonthlyLine_projectId_idx" ON "GtsMonthlyLine"("projectId");
