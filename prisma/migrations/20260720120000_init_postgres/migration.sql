-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CompanyAdmin', 'CEO', 'SVP', 'VP', 'AVP', 'ProjectManager', 'Employee');

-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('Requirements', 'Design', 'Dev', 'Test', 'UAT', 'Closed');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('internal', 'client_informed');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('not_run', 'pass', 'fail', 'blocked');

-- CreateEnum
CREATE TYPE "DefectSource" AS ENUM ('internal', 'client_informed');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "StatusRequestState" AS ENUM ('pending', 'submitted', 'expired', 'skipped_leave');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'blocked', 'done');

-- CreateEnum
CREATE TYPE "WeeklyReportScope" AS ENUM ('resource', 'project', 'account', 'company');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('epic', 'feature', 'story');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('task', 'subtask');

-- CreateEnum
CREATE TYPE "RcaStatus" AS ENUM ('draft', 'in_progress', 'pending_review', 'closed');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "statusWindowStart" TEXT NOT NULL DEFAULT '17:00',
    "statusWindowHours" INTEGER NOT NULL DEFAULT 2,
    "weeklyReportDay" INTEGER NOT NULL DEFAULT 1,
    "weeklyReportTime" TEXT NOT NULL DEFAULT '09:00',
    "deadlineWarnDays" TEXT NOT NULL DEFAULT '3,1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Employee',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleFeature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "technology" TEXT,
    "domain" TEXT,
    "projectManagers" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "phase" "ProjectPhase" NOT NULL DEFAULT 'Requirements',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "capacityPct" INTEGER NOT NULL DEFAULT 100,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "roleLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraWorkingDay" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraWorkingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingMonthOverride" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalWorkingDays" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingMonthOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceId" TEXT,
    "parentId" TEXT,
    "kind" "TaskKind" NOT NULL DEFAULT 'task',
    "phase" "ProjectPhase" NOT NULL DEFAULT 'Dev',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "estimateDays" DOUBLE PRECISION,
    "estimateHours" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "clientDeadline" TIMESTAMP(3),
    "resourceDeadline" TIMESTAMP(3),
    "requirementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "RequirementKind" NOT NULL DEFAULT 'story',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT,
    "title" TEXT NOT NULL,
    "steps" TEXT,
    "expected" TEXT,
    "status" "TestCaseStatus" NOT NULL DEFAULT 'not_run',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "DefectSource" NOT NULL DEFAULT 'internal',
    "severity" "DefectSeverity" NOT NULL DEFAULT 'medium',
    "status" "DefectStatus" NOT NULL DEFAULT 'open',
    "taskId" TEXT,
    "requirementId" TEXT,
    "testCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RCA" (
    "id" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "problemStatement" TEXT,
    "rootCause" TEXT NOT NULL,
    "contributingFactors" TEXT,
    "impact" TEXT,
    "containmentAction" TEXT,
    "correctiveAction" TEXT NOT NULL,
    "preventiveAction" TEXT,
    "owner" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" "RcaStatus" NOT NULL DEFAULT 'draft',
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RCA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSheet" (
    "id" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "rcaId" TEXT,
    "reviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerName" TEXT,
    "reviewType" TEXT NOT NULL DEFAULT 'internal',
    "scopeSummary" TEXT,
    "codeReviewDone" BOOLEAN NOT NULL DEFAULT false,
    "testReviewDone" BOOLEAN NOT NULL DEFAULT false,
    "documentationUpdated" BOOLEAN NOT NULL DEFAULT false,
    "clientCommunication" BOOLEAN NOT NULL DEFAULT false,
    "regressionCovered" BOOLEAN NOT NULL DEFAULT false,
    "findings" TEXT,
    "actionItems" TEXT,
    "residualRisk" TEXT,
    "signOff" TEXT,
    "signOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "resourceId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'approved',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusWindow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusRequest" (
    "id" TEXT NOT NULL,
    "statusWindowId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "state" "StatusRequestState" NOT NULL DEFAULT 'pending',
    "emailSentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStatus" (
    "id" TEXT NOT NULL,
    "statusRequestId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "productiveHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonProductiveHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "narrative" TEXT,
    "blockers" TEXT,
    "progressPct" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStatusItem" (
    "id" TEXT NOT NULL,
    "dailyStatusId" TEXT NOT NULL,
    "taskId" TEXT,
    "taskTitle" TEXT,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "progressPct" INTEGER,
    "notes" TEXT,

    CONSTRAINT "DailyStatusItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipients" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" "WeeklyReportScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "narrative" TEXT,
    "emailedTo" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtsMonthlyReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "projectName" TEXT,
    "projectManagers" TEXT,
    "technology" TEXT,
    "domain" TEXT,
    "utilizationPct" DOUBLE PRECISION,
    "availabilityPct" DOUBLE PRECISION,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GtsMonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtsMonthlyLine" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "projectId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "subProjectName" TEXT NOT NULL,
    "featureName" TEXT NOT NULL DEFAULT '',
    "uatDefects" INTEGER NOT NULL DEFAULT 0,
    "actualEffortHrs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "GtsMonthlyLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "RoleFeature_companyId_idx" ON "RoleFeature"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleFeature_companyId_role_feature_key" ON "RoleFeature"("companyId", "role", "feature");

-- CreateIndex
CREATE INDEX "Account_companyId_idx" ON "Account"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_name_key" ON "Account"("companyId", "name");

-- CreateIndex
CREATE INDEX "Project_accountId_idx" ON "Project"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_accountId_name_key" ON "Project"("accountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_userId_key" ON "Resource"("userId");

-- CreateIndex
CREATE INDEX "Resource_companyId_idx" ON "Resource"("companyId");

-- CreateIndex
CREATE INDEX "Resource_companyId_employeeId_idx" ON "Resource"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_companyId_email_key" ON "Resource"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAssignment_projectId_resourceId_key" ON "ResourceAssignment"("projectId", "resourceId");

-- CreateIndex
CREATE INDEX "ExtraWorkingDay_resourceId_date_idx" ON "ExtraWorkingDay"("resourceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraWorkingDay_resourceId_projectId_date_key" ON "ExtraWorkingDay"("resourceId", "projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BillingMonthOverride_companyId_year_month_key" ON "BillingMonthOverride"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_resourceId_idx" ON "Task"("resourceId");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE INDEX "Task_phase_idx" ON "Task"("phase");

-- CreateIndex
CREATE INDEX "Task_startDate_idx" ON "Task"("startDate");

-- CreateIndex
CREATE INDEX "Task_endDate_idx" ON "Task"("endDate");

-- CreateIndex
CREATE INDEX "Task_clientDeadline_idx" ON "Task"("clientDeadline");

-- CreateIndex
CREATE INDEX "Task_resourceDeadline_idx" ON "Task"("resourceDeadline");

-- CreateIndex
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");

-- CreateIndex
CREATE INDEX "Requirement_kind_idx" ON "Requirement"("kind");

-- CreateIndex
CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");

-- CreateIndex
CREATE INDEX "Defect_projectId_idx" ON "Defect"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RCA_defectId_key" ON "RCA"("defectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSheet_defectId_key" ON "ReviewSheet"("defectId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSheet_rcaId_key" ON "ReviewSheet"("rcaId");

-- CreateIndex
CREATE INDEX "Leave_resourceId_idx" ON "Leave"("resourceId");

-- CreateIndex
CREATE INDEX "Leave_startDate_endDate_idx" ON "Leave"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "StatusWindow_companyId_expiresAt_idx" ON "StatusWindow"("companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatusWindow_companyId_date_key" ON "StatusWindow"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StatusRequest_tokenHash_key" ON "StatusRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "StatusRequest_resourceId_idx" ON "StatusRequest"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusRequest_statusWindowId_resourceId_key" ON "StatusRequest"("statusWindowId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStatus_statusRequestId_key" ON "DailyStatus"("statusRequestId");

-- CreateIndex
CREATE INDEX "DailyStatus_resourceId_date_idx" ON "DailyStatus"("resourceId", "date");

-- CreateIndex
CREATE INDEX "NotificationLog_companyId_type_idx" ON "NotificationLog"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_companyId_dedupeKey_key" ON "NotificationLog"("companyId", "dedupeKey");

-- CreateIndex
CREATE INDEX "WeeklyReport_companyId_scope_periodStart_idx" ON "WeeklyReport"("companyId", "scope", "periodStart");

-- CreateIndex
CREATE INDEX "GtsMonthlyReport_companyId_year_month_idx" ON "GtsMonthlyReport"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "GtsMonthlyReport_accountId_year_month_key" ON "GtsMonthlyReport"("accountId", "year", "month");

-- CreateIndex
CREATE INDEX "GtsMonthlyLine_reportId_idx" ON "GtsMonthlyLine"("reportId");

-- CreateIndex
CREATE INDEX "GtsMonthlyLine_projectId_idx" ON "GtsMonthlyLine"("projectId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleFeature" ADD CONSTRAINT "RoleFeature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraWorkingDay" ADD CONSTRAINT "ExtraWorkingDay_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraWorkingDay" ADD CONSTRAINT "ExtraWorkingDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMonthOverride" ADD CONSTRAINT "BillingMonthOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RCA" ADD CONSTRAINT "RCA_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSheet" ADD CONSTRAINT "ReviewSheet_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSheet" ADD CONSTRAINT "ReviewSheet_rcaId_fkey" FOREIGN KEY ("rcaId") REFERENCES "RCA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusWindow" ADD CONSTRAINT "StatusWindow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusRequest" ADD CONSTRAINT "StatusRequest_statusWindowId_fkey" FOREIGN KEY ("statusWindowId") REFERENCES "StatusWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusRequest" ADD CONSTRAINT "StatusRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStatus" ADD CONSTRAINT "DailyStatus_statusRequestId_fkey" FOREIGN KEY ("statusRequestId") REFERENCES "StatusRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStatus" ADD CONSTRAINT "DailyStatus_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStatus" ADD CONSTRAINT "DailyStatus_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStatusItem" ADD CONSTRAINT "DailyStatusItem_dailyStatusId_fkey" FOREIGN KEY ("dailyStatusId") REFERENCES "DailyStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStatusItem" ADD CONSTRAINT "DailyStatusItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtsMonthlyReport" ADD CONSTRAINT "GtsMonthlyReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtsMonthlyReport" ADD CONSTRAINT "GtsMonthlyReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtsMonthlyLine" ADD CONSTRAINT "GtsMonthlyLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "GtsMonthlyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtsMonthlyLine" ADD CONSTRAINT "GtsMonthlyLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
