import { prisma } from "@/lib/prisma";

function pick(companyVal: string | null | undefined, envVal: string | undefined): string {
  const c = companyVal?.trim();
  if (c) return c;
  return (envVal ?? "").trim();
}

function normalizeKey(raw: string) {
  return raw.replace(/\\n/g, "\n").trim();
}

export type ResolvedMailConfig = {
  provider: "gmail" | "smtp" | "console";
  from: string;
  gmailUserEmail?: string;
  gmailClientEmail?: string;
  gmailPrivateKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
};

export async function loadCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId } });
}

function gmailReady(cfg: {
  gmailUserEmail?: string;
  gmailClientEmail?: string;
  gmailPrivateKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
}) {
  const user = cfg.gmailUserEmail?.trim();
  if (!user) return false;
  const sa = Boolean(cfg.gmailClientEmail?.trim() && cfg.gmailPrivateKey?.trim());
  const oauth = Boolean(
    cfg.gmailClientId?.trim() && cfg.gmailClientSecret?.trim() && cfg.gmailRefreshToken?.trim(),
  );
  return sa || oauth;
}

export async function resolveMailConfig(companyId: string): Promise<ResolvedMailConfig> {
  const company = await loadCompany(companyId);
  const from =
    pick(company?.emailFrom, process.env.EMAIL_FROM) || "AI Scrum Master <noreply@localhost>";

  const gmailUserEmail = pick(company?.gmailUserEmail, process.env.GMAIL_USER_EMAIL);
  const gmailClientEmail = pick(
    company?.gmailClientEmail ?? company?.googleClientEmail,
    process.env.GMAIL_CLIENT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL,
  );
  const gmailPrivateKeyRaw = pick(
    company?.gmailPrivateKey ?? company?.googlePrivateKey,
    process.env.GMAIL_PRIVATE_KEY ?? process.env.GOOGLE_PRIVATE_KEY,
  );
  const gmailPrivateKey = gmailPrivateKeyRaw ? normalizeKey(gmailPrivateKeyRaw) : "";
  const gmailClientId = pick(company?.gmailClientId, process.env.GMAIL_CLIENT_ID);
  const gmailClientSecret = pick(company?.gmailClientSecret, process.env.GMAIL_CLIENT_SECRET);
  const gmailRefreshToken = pick(company?.gmailRefreshToken, process.env.GMAIL_REFRESH_TOKEN);

  const smtpHost = pick(company?.smtpHost, process.env.SMTP_HOST);
  const smtpPort = company?.smtpPort ?? Number(process.env.SMTP_PORT ?? 587);
  const smtpUser = pick(company?.smtpUser, process.env.SMTP_USER);
  const smtpPass = pick(company?.smtpPass, process.env.SMTP_PASS);

  const preferred = (company?.mailProvider ?? process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  const hasGmail = gmailReady({
    gmailUserEmail,
    gmailClientEmail,
    gmailPrivateKey,
    gmailClientId,
    gmailClientSecret,
    gmailRefreshToken,
  });

  let provider: ResolvedMailConfig["provider"] = "console";
  if (preferred === "gmail" && hasGmail) provider = "gmail";
  else if (preferred === "smtp" && smtpHost) provider = "smtp";
  else if (hasGmail) provider = "gmail";
  else if (smtpHost) provider = "smtp";

  return {
    provider,
    from,
    gmailUserEmail: gmailUserEmail || undefined,
    gmailClientEmail: gmailClientEmail || undefined,
    gmailPrivateKey: gmailPrivateKey || undefined,
    gmailClientId: gmailClientId || undefined,
    gmailClientSecret: gmailClientSecret || undefined,
    gmailRefreshToken: gmailRefreshToken || undefined,
    smtpHost: smtpHost || undefined,
    smtpPort,
    smtpUser: smtpUser || undefined,
    smtpPass: smtpPass || undefined,
  };
}

export async function resolveOpenAi(companyId: string) {
  const company = await loadCompany(companyId);
  const apiKey = pick(company?.openaiApiKey, process.env.OPENAI_API_KEY);
  const model = pick(company?.openaiModel, process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const fromCompany = company?.aiParseEnabled;
  const aiParseEnabled =
    fromCompany != null
      ? Boolean(fromCompany && apiKey)
      : process.env.AI_PARSE_ENABLED === "true" && Boolean(apiKey);
  return { apiKey: apiKey || undefined, model, aiParseEnabled };
}

export async function resolveTeamsEnv(companyId: string) {
  const company = await loadCompany(companyId);
  const appId = pick(company?.microsoftAppId, process.env.MICROSOFT_APP_ID);
  const appPassword = pick(company?.microsoftAppPassword, process.env.MICROSOFT_APP_PASSWORD);
  if (!appId || !appPassword) return null;
  return {
    appId,
    appPassword,
    appType: pick(company?.microsoftAppType, process.env.MICROSOFT_APP_TYPE) || "MultiTenant",
    appTenantId: pick(company?.microsoftAppTenantId, process.env.MICROSOFT_APP_TENANT_ID),
    teamsAppExternalId: pick(company?.teamsAppExternalId, process.env.TEAMS_APP_EXTERNAL_ID) || undefined,
    graphTenantId:
      pick(company?.graphTenantId, process.env.GRAPH_TENANT_ID ?? process.env.MICROSOFT_APP_TENANT_ID) ||
      undefined,
  };
}

export async function resolveMeetingProviderConfig(companyId: string) {
  const company = await loadCompany(companyId);
  const googleClientEmail = pick(company?.googleClientEmail, process.env.GOOGLE_CLIENT_EMAIL);
  const googlePrivateKeyRaw = pick(company?.googlePrivateKey, process.env.GOOGLE_PRIVATE_KEY);
  const googlePrivateKey = googlePrivateKeyRaw ? normalizeKey(googlePrivateKeyRaw) : "";
  const googleCalendarId = pick(company?.googleCalendarId, process.env.GOOGLE_CALENDAR_ID);
  const graphMeetingUserId = pick(company?.graphMeetingUserId, process.env.GRAPH_MEETING_USER_ID);
  const teams = await resolveTeamsEnv(companyId);

  const googleCreds = Boolean(googleClientEmail && googlePrivateKey && googleCalendarId);
  const teamsCreds = Boolean(teams?.graphTenantId && graphMeetingUserId);

  return {
    google: Boolean(googleCreds && (company?.meetGoogleEnabled ?? true)),
    teams: Boolean(teamsCreds && (company?.meetTeamsEnabled ?? true)),
    googleClientEmail: googleClientEmail || undefined,
    googlePrivateKey: googlePrivateKey || undefined,
    googleCalendarId: googleCalendarId || undefined,
    graphMeetingUserId: graphMeetingUserId || undefined,
    teamsEnv: teams,
  };
}

export function settingsPublicView(company: NonNullable<Awaited<ReturnType<typeof loadCompany>>>) {
  return {
    name: company.name,
    timezone: company.timezone,
    statusWindowStart: company.statusWindowStart,
    statusWindowHours: company.statusWindowHours,
    weeklyReportDay: company.weeklyReportDay,
    weeklyReportTime: company.weeklyReportTime,
    deadlineWarnDays: company.deadlineWarnDays,
    mailProvider: company.mailProvider ?? "",
    emailFrom: company.emailFrom ?? "",
    gmailUserEmail: company.gmailUserEmail ?? "",
    gmailClientEmail: company.gmailClientEmail ?? "",
    gmailClientId: company.gmailClientId ?? "",
    smtpHost: company.smtpHost ?? "",
    smtpPort: company.smtpPort ?? 587,
    smtpUser: company.smtpUser ?? "",
    openaiModel: company.openaiModel ?? "",
    aiParseEnabled: company.aiParseEnabled ?? false,
    microsoftAppId: company.microsoftAppId ?? "",
    microsoftAppType: company.microsoftAppType ?? "",
    microsoftAppTenantId: company.microsoftAppTenantId ?? "",
    teamsAppExternalId: company.teamsAppExternalId ?? "",
    graphTenantId: company.graphTenantId ?? "",
    meetGoogleEnabled: company.meetGoogleEnabled,
    meetTeamsEnabled: company.meetTeamsEnabled,
    googleClientEmail: company.googleClientEmail ?? "",
    googleCalendarId: company.googleCalendarId ?? "",
    graphMeetingUserId: company.graphMeetingUserId ?? "",
    meetingNoteIdPrefix: company.meetingNoteIdPrefix ?? "",
    configured: {
      gmailPrivateKey: Boolean(company.gmailPrivateKey),
      gmailClientSecret: Boolean(company.gmailClientSecret),
      gmailRefreshToken: Boolean(company.gmailRefreshToken),
      smtpPass: Boolean(company.smtpPass),
      openaiApiKey: Boolean(company.openaiApiKey),
      microsoftAppPassword: Boolean(company.microsoftAppPassword),
      googlePrivateKey: Boolean(company.googlePrivateKey),
    },
  };
}

/** Settings payload including Teams agent options (TeamsConfig). */
export async function settingsPublicViewFull(companyId: string) {
  const company = await loadCompany(companyId);
  if (!company) return null;
  const { getTeamsConfig } = await import("@/lib/teams/link");
  const teamsCfg = await getTeamsConfig(companyId);
  return {
    ...settingsPublicView(company),
    teamsAgentEnabled: teamsCfg.enabled,
    teamsChaseEnabled: teamsCfg.chaseEnabled,
    teamsTenantId: teamsCfg.tenantId ?? "",
    teamsReminderMinutesBefore: teamsCfg.reminderMinutesBefore,
  };
}
