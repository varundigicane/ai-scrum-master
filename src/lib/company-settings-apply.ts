import { prisma } from "@/lib/prisma";
import { getTeamsConfig } from "@/lib/teams/link";

type Patch = Record<string, unknown>;

export type SettingsPanel = "delivery" | "mail" | "ai" | "teams" | "meetings" | "all";

function has(patch: Patch | FormData, key: string) {
  if (patch instanceof FormData) return patch.has(key);
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function getRaw(patch: Patch | FormData, key: string) {
  if (patch instanceof FormData) {
    const all = patch.getAll(key);
    if (all.length === 0) return null;
    return all[all.length - 1];
  }
  const v = patch[key];
  if (v === true) return "true";
  if (v === false) return "false";
  return v == null ? null : String(v);
}

function asBool(raw: FormDataEntryValue | string | null) {
  return raw === "on" || raw === "true" || raw === "1";
}

function asOptStr(raw: FormDataEntryValue | string | null) {
  const s = String(raw ?? "").trim();
  return s || null;
}

function resolvePanel(patch: FormData | Patch): SettingsPanel {
  const raw = String(getRaw(patch, "settingsPanel") ?? "").trim().toLowerCase();
  if (raw === "delivery" || raw === "mail" || raw === "ai" || raw === "teams" || raw === "meetings") {
    return raw;
  }
  // JSON without panel: update only keys present (caller may send a subset).
  if (!(patch instanceof FormData)) return "all";
  // Legacy mega-form without panel → all company fields present in form.
  return "all";
}

/**
 * Apply Settings. Prefer settingsPanel=delivery|mail|ai|teams|meetings for partial saves.
 * JSON PATCH only updates keys present when panel is "all".
 * Secret fields: empty / missing keeps previous.
 */
export async function applyCompanyAppSettings(companyId: string, patch: FormData | Patch) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const isForm = patch instanceof FormData;
  const panel = resolvePanel(patch);
  const data: Record<string, unknown> = {};

  const inPanel = (p: SettingsPanel) => panel === "all" || panel === p;

  const setStr = (key: keyof typeof company, formKey = key as string) => {
    if (!isForm && !has(patch, formKey)) return;
    if (isForm && panel !== "all" && !has(patch, formKey)) return;
    data[key] = asOptStr(getRaw(patch, formKey)) ?? (isForm ? null : company[key]);
  };

  const setRequiredStr = (key: keyof typeof company, fallback: string, formKey = key as string) => {
    if (!isForm && !has(patch, formKey)) return;
    if (isForm && panel !== "all" && !has(patch, formKey)) return;
    const v = String(getRaw(patch, formKey) ?? "").trim();
    data[key] = v || fallback;
  };

  const setSecret = (key: keyof typeof company, formKey = key as string) => {
    if (!has(patch, formKey)) return;
    const v = String(getRaw(patch, formKey) ?? "");
    if (!v.trim()) return;
    data[key] = v;
  };

  const setBool = (key: keyof typeof company, formKey = key as string) => {
    if (isForm) {
      if (panel !== "all" && !has(patch, formKey) && panel !== "meetings" && panel !== "ai" && panel !== "teams") {
        return;
      }
      // Panel forms include hidden false + checkbox true; getRaw takes last.
      if (panel !== "all" && !has(patch, formKey)) {
        // Checkbox absent → false for known bool panels
        if (panel === "ai" || panel === "meetings" || panel === "teams") {
          data[key] = false;
        }
        return;
      }
      data[key] = asBool(getRaw(patch, formKey));
      return;
    }
    if (!has(patch, formKey)) return;
    data[key] = asBool(getRaw(patch, formKey));
  };

  const setNum = (key: keyof typeof company, formKey = key as string) => {
    if (!isForm && !has(patch, formKey)) return;
    if (isForm && panel !== "all" && !has(patch, formKey)) return;
    const n = Number(getRaw(patch, formKey));
    if (Number.isFinite(n)) data[key] = n;
  };

  if (inPanel("delivery")) {
    setRequiredStr("timezone", company.timezone);
    setRequiredStr("statusWindowStart", company.statusWindowStart);
    setNum("statusWindowHours");
    setRequiredStr("weeklyReportTime", company.weeklyReportTime);
    setNum("weeklyReportDay");
    setRequiredStr("deadlineWarnDays", company.deadlineWarnDays);
    setStr("meetingNoteIdPrefix");
  }

  if (inPanel("mail")) {
    setStr("mailProvider");
    setStr("emailFrom");
    setStr("gmailUserEmail");
    setStr("gmailClientEmail");
    setSecret("gmailPrivateKey");
    setStr("gmailClientId");
    setSecret("gmailClientSecret");
    setSecret("gmailRefreshToken");
    setStr("smtpHost");
    setNum("smtpPort");
    setStr("smtpUser");
    setSecret("smtpPass");
  }

  if (inPanel("ai")) {
    setSecret("openaiApiKey");
    setStr("openaiModel");
    if (isForm || has(patch, "aiParseEnabled")) setBool("aiParseEnabled");
  }

  if (inPanel("teams")) {
    setStr("microsoftAppId");
    setSecret("microsoftAppPassword");
    setStr("microsoftAppType");
    setStr("microsoftAppTenantId");
    setStr("teamsAppExternalId");
    setStr("graphTenantId");
  }

  if (inPanel("meetings")) {
    if (isForm || has(patch, "meetGoogleEnabled")) setBool("meetGoogleEnabled");
    if (isForm || has(patch, "meetTeamsEnabled")) setBool("meetTeamsEnabled");
    setStr("googleClientEmail");
    setSecret("googlePrivateKey");
    setStr("googleCalendarId");
    setStr("graphMeetingUserId");
  }

  let updated = company;
  if (Object.keys(data).length > 0) {
    updated = await prisma.company.update({ where: { id: companyId }, data });
  }

  // Teams agent options live on TeamsConfig (Settings only).
  if (inPanel("teams")) {
    const cfg = await getTeamsConfig(companyId);
    const teamsData: {
      enabled?: boolean;
      chaseEnabled?: boolean;
      tenantId?: string | null;
      reminderMinutesBefore?: number;
    } = {};

    if (has(patch, "teamsAgentEnabled") || (isForm && panel === "teams")) {
      teamsData.enabled = asBool(getRaw(patch, "teamsAgentEnabled"));
    }
    if (has(patch, "teamsChaseEnabled") || (isForm && panel === "teams")) {
      teamsData.chaseEnabled = asBool(getRaw(patch, "teamsChaseEnabled"));
    }
    if (has(patch, "teamsTenantId") || (isForm && panel === "teams")) {
      teamsData.tenantId = asOptStr(getRaw(patch, "teamsTenantId"));
    }
    if (has(patch, "teamsReminderMinutesBefore") || (isForm && panel === "teams")) {
      const n = Number(getRaw(patch, "teamsReminderMinutesBefore"));
      if (Number.isFinite(n)) {
        teamsData.reminderMinutesBefore = Math.max(0, Math.min(240, Math.round(n)));
      }
    }

    if (Object.keys(teamsData).length > 0) {
      await prisma.teamsConfig.update({ where: { id: cfg.id }, data: teamsData });
    }
  }

  return updated;
}
