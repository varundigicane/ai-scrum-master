-- CreateTable
CREATE TABLE "TeamsConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT,
    "chaseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsIdentity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT,
    "aadObjectId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "upn" TEXT,
    "displayName" TEXT,
    "conversationId" TEXT,
    "serviceUrl" TEXT,
    "conversationRef" TEXT,
    "installedAt" TIMESTAMP(3),
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsChannelLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'channel',
    "teamId" TEXT,
    "channelId" TEXT,
    "conversationId" TEXT NOT NULL,
    "serviceUrl" TEXT NOT NULL,
    "conversationRef" TEXT NOT NULL,
    "name" TEXT,
    "notifyTypes" TEXT NOT NULL DEFAULT 'status_missed,status_blocker,deadline_overdue,weekly_project,weekly_company',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamsChannelLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsMessageLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "payloadSummary" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamsMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamsInteraction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "teamsIdentityId" TEXT,
    "activityId" TEXT,
    "command" TEXT NOT NULL,
    "inputText" TEXT,
    "parsedJson" TEXT,
    "outcome" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamsInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamsConfig_companyId_key" ON "TeamsConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsIdentity_resourceId_key" ON "TeamsIdentity"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsIdentity_userId_key" ON "TeamsIdentity"("userId");

-- CreateIndex
CREATE INDEX "TeamsIdentity_companyId_idx" ON "TeamsIdentity"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsIdentity_companyId_aadObjectId_key" ON "TeamsIdentity"("companyId", "aadObjectId");

-- CreateIndex
CREATE INDEX "TeamsChannelLink_companyId_idx" ON "TeamsChannelLink"("companyId");

-- CreateIndex
CREATE INDEX "TeamsChannelLink_projectId_idx" ON "TeamsChannelLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsChannelLink_companyId_conversationId_key" ON "TeamsChannelLink"("companyId", "conversationId");

-- CreateIndex
CREATE INDEX "TeamsMessageLog_companyId_type_idx" ON "TeamsMessageLog"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TeamsMessageLog_companyId_dedupeKey_key" ON "TeamsMessageLog"("companyId", "dedupeKey");

-- CreateIndex
CREATE INDEX "TeamsInteraction_companyId_createdAt_idx" ON "TeamsInteraction"("companyId", "createdAt");
