import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTestEmailSettings, updateCompanySettings } from "@/app/actions";
import { hasFeature } from "@/lib/permissions";
import { resolveMailConfig } from "@/lib/company-config";
import { getTeamsConfig } from "@/lib/teams/link";
import { resolveTeamsEnv } from "@/lib/company-config";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasFeature(session.user.companyId, session.user.role, "settings"))) {
    redirect("/dashboard");
  }
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: session.user.companyId },
  });
  const canEdit = await hasFeature(session.user.companyId, session.user.role, "edit_settings");
  const mail = await resolveMailConfig(session.user.companyId);
  const teamsCfg = await getTeamsConfig(session.user.companyId);
  const teamsEnv = await resolveTeamsEnv(session.user.companyId);

  const secretHint = (configured: boolean) =>
    configured ? "Configured — leave blank to keep" : "Not set";

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto px-1">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Company application settings for {company.name}. Host secrets (database, auth) stay on the
          server. Empty secret fields keep the current value. Mail and MS Teams each have their own
          save.
        </p>
      </div>

      {!canEdit ? (
        <p className="text-sm text-[var(--muted)]">View only — your role cannot edit settings.</p>
      ) : null}

      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <input type="hidden" name="settingsPanel" value="delivery" />
        <h3 className="font-semibold">Delivery window</h3>
        <div>
          <label className="label">Timezone</label>
          <input
            className="input w-full"
            name="timezone"
            defaultValue={company.timezone}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Daily status start (HH:mm)</label>
          <input
            className="input w-full"
            name="statusWindowStart"
            defaultValue={company.statusWindowStart}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Window length (hours)</label>
          <input
            className="input w-full"
            name="statusWindowHours"
            type="number"
            min={1}
            max={8}
            defaultValue={company.statusWindowHours}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Weekly report time</label>
          <input
            className="input w-full"
            name="weeklyReportTime"
            defaultValue={company.weeklyReportTime}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Weekly report day (0=Sun … 6=Sat)</label>
          <input
            className="input w-full"
            name="weeklyReportDay"
            type="number"
            min={0}
            max={6}
            defaultValue={company.weeklyReportDay}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Deadline warn days (comma-separated)</label>
          <input
            className="input w-full"
            name="deadlineWarnDays"
            defaultValue={company.deadlineWarnDays}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Meeting note ID prefix (e.g. ACME → ACME-1)</label>
          <input
            className="input w-full"
            name="meetingNoteIdPrefix"
            defaultValue={company.meetingNoteIdPrefix ?? ""}
            placeholder="Blank = first 4 letters of company name"
            disabled={!canEdit}
          />
        </div>
        {canEdit ? (
          <button className="btn" type="submit">
            Save delivery
          </button>
        ) : null}
      </form>

      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <input type="hidden" name="settingsPanel" value="mail" />
        <h3 className="font-semibold">Mail</h3>
        <p className="text-xs text-[var(--muted)]">
          Active provider: <strong>{mail.provider}</strong>. Prefer Gmail API on Railway — SMTP often
          fails on hobby.
        </p>
        <div>
          <label className="label">Provider</label>
          <select
            className="input w-full"
            name="mailProvider"
            defaultValue={company.mailProvider ?? ""}
            disabled={!canEdit}
          >
            <option value="">Auto (Gmail if configured, else SMTP)</option>
            <option value="gmail">Gmail API</option>
            <option value="smtp">SMTP (local/dev)</option>
          </select>
        </div>
        <div>
          <label className="label">From address</label>
          <input
            className="input w-full"
            name="emailFrom"
            defaultValue={company.emailFrom ?? ""}
            placeholder="AI Scrum Master <noreply@company.com>"
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail user (send-as mailbox)</label>
          <input
            className="input w-full"
            name="gmailUserEmail"
            defaultValue={company.gmailUserEmail ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail SA client email</label>
          <input
            className="input w-full"
            name="gmailClientEmail"
            defaultValue={company.gmailClientEmail ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail SA private key</label>
          <textarea
            className="input w-full min-h-[80px] font-mono text-xs"
            name="gmailPrivateKey"
            placeholder={secretHint(Boolean(company.gmailPrivateKey))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail OAuth client id</label>
          <input
            className="input w-full"
            name="gmailClientId"
            defaultValue={company.gmailClientId ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail OAuth client secret</label>
          <input
            className="input w-full"
            name="gmailClientSecret"
            type="password"
            placeholder={secretHint(Boolean(company.gmailClientSecret))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Gmail refresh token</label>
          <input
            className="input w-full"
            name="gmailRefreshToken"
            type="password"
            placeholder={secretHint(Boolean(company.gmailRefreshToken))}
            disabled={!canEdit}
          />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--muted)]">SMTP (optional / local)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              className="input w-full"
              name="smtpHost"
              placeholder="SMTP host"
              defaultValue={company.smtpHost ?? ""}
              disabled={!canEdit}
            />
            <input
              className="input w-full"
              name="smtpPort"
              type="number"
              placeholder="587"
              defaultValue={company.smtpPort ?? 587}
              disabled={!canEdit}
            />
            <input
              className="input w-full"
              name="smtpUser"
              placeholder="SMTP user"
              defaultValue={company.smtpUser ?? ""}
              disabled={!canEdit}
            />
            <input
              className="input w-full"
              name="smtpPass"
              type="password"
              placeholder={secretHint(Boolean(company.smtpPass))}
              disabled={!canEdit}
            />
          </div>
        </details>
        {canEdit ? (
          <button className="btn" type="submit">
            Save mail
          </button>
        ) : null}
      </form>

      {canEdit ? (
        <form action={sendTestEmailSettings} className="panel p-4 space-y-3">
          <h3 className="font-semibold">Send test email</h3>
          <input
            className="input w-full"
            name="testTo"
            type="email"
            defaultValue={session.user.email}
            required
          />
          <button className="btn btn-secondary" type="submit">
            Send test
          </button>
        </form>
      ) : null}

      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <input type="hidden" name="settingsPanel" value="ai" />
        <h3 className="font-semibold">AI</h3>
        <div>
          <label className="label">OpenAI API key</label>
          <input
            className="input w-full"
            name="openaiApiKey"
            type="password"
            placeholder={secretHint(Boolean(company.openaiApiKey))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">OpenAI model</label>
          <input
            className="input w-full"
            name="openaiModel"
            defaultValue={company.openaiModel ?? "gpt-4o-mini"}
            disabled={!canEdit}
          />
        </div>
        <input type="hidden" name="aiParseEnabled" value="false" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aiParseEnabled"
            value="true"
            defaultChecked={Boolean(company.aiParseEnabled)}
            disabled={!canEdit}
          />
          Enable AI free-text status parse
        </label>
        {canEdit ? (
          <button className="btn" type="submit">
            Save AI
          </button>
        ) : null}
      </form>

      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <input type="hidden" name="settingsPanel" value="teams" />
        <h3 className="font-semibold">MS Teams</h3>
        <p className="text-xs text-[var(--muted)]">
          Bot credentials and agent options. Linked people and channels stay on the MS Teams menu.
          {teamsEnv || company.microsoftAppId ? (
            <span className="text-emerald-600"> Credentials available.</span>
          ) : (
            <span className="text-amber-700"> Add App ID and password below.</span>
          )}
        </p>
        <input type="hidden" name="teamsAgentEnabled" value="false" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="teamsAgentEnabled"
            value="true"
            defaultChecked={teamsCfg.enabled}
            disabled={!canEdit}
          />
          Enable the Teams agent for this company
        </label>
        <input type="hidden" name="teamsChaseEnabled" value="false" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="teamsChaseEnabled"
            value="true"
            defaultChecked={teamsCfg.chaseEnabled}
            disabled={!canEdit}
          />
          Send the daily status card when a window opens
        </label>
        <div>
          <label className="label">Azure AD tenant id (agent)</label>
          <input
            className="input w-full"
            name="teamsTenantId"
            defaultValue={teamsCfg.tenantId ?? ""}
            placeholder="Adopted from first inbound message if blank"
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Remind minutes before window closes</label>
          <input
            className="input w-full"
            name="teamsReminderMinutesBefore"
            type="number"
            min={0}
            max={240}
            defaultValue={teamsCfg.reminderMinutesBefore}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Bot App ID</label>
          <input
            className="input w-full"
            name="microsoftAppId"
            defaultValue={company.microsoftAppId ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Bot App password</label>
          <input
            className="input w-full"
            name="microsoftAppPassword"
            type="password"
            placeholder={secretHint(Boolean(company.microsoftAppPassword))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">App type</label>
          <input
            className="input w-full"
            name="microsoftAppType"
            placeholder="SingleTenant / MultiTenant"
            defaultValue={company.microsoftAppType ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">App tenant ID</label>
          <input
            className="input w-full"
            name="microsoftAppTenantId"
            defaultValue={company.microsoftAppTenantId ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Teams app external ID</label>
          <input
            className="input w-full"
            name="teamsAppExternalId"
            defaultValue={company.teamsAppExternalId ?? ""}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className="label">Graph tenant ID</label>
          <input
            className="input w-full"
            name="graphTenantId"
            defaultValue={company.graphTenantId ?? ""}
            disabled={!canEdit}
          />
        </div>
        {canEdit ? (
          <button className="btn" type="submit">
            Save MS Teams
          </button>
        ) : null}
      </form>

      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <input type="hidden" name="settingsPanel" value="meetings" />
        <h3 className="font-semibold">Online meetings (Meet / Teams)</h3>
        <input type="hidden" name="meetGoogleEnabled" value="false" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="meetGoogleEnabled"
            value="true"
            defaultChecked={company.meetGoogleEnabled}
            disabled={!canEdit}
          />
          Enable Google Meet auto-create
        </label>
        <input type="hidden" name="meetTeamsEnabled" value="false" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="meetTeamsEnabled"
            value="true"
            defaultChecked={company.meetTeamsEnabled}
            disabled={!canEdit}
          />
          Enable Teams meeting auto-create
        </label>
        <input
          className="input w-full"
          name="googleClientEmail"
          placeholder="Google SA email"
          defaultValue={company.googleClientEmail ?? ""}
          disabled={!canEdit}
        />
        <textarea
          className="input w-full min-h-[80px] font-mono text-xs"
          name="googlePrivateKey"
          placeholder={secretHint(Boolean(company.googlePrivateKey))}
          disabled={!canEdit}
        />
        <input
          className="input w-full"
          name="googleCalendarId"
          placeholder="Calendar ID"
          defaultValue={company.googleCalendarId ?? ""}
          disabled={!canEdit}
        />
        <input
          className="input w-full"
          name="graphMeetingUserId"
          placeholder="Graph user id for onlineMeetings"
          defaultValue={company.graphMeetingUserId ?? ""}
          disabled={!canEdit}
        />
        {canEdit ? (
          <button className="btn" type="submit">
            Save meetings
          </button>
        ) : null}
      </form>
    </div>
  );
}
