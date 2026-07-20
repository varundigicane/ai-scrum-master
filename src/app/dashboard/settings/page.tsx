import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateCompanySettings } from "@/app/actions";
import { hasFeature } from "@/lib/permissions";

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

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-[var(--muted)]">Daily window and notification defaults for {company.name}.</p>
      </div>

      {canEdit ? (
      <form action={updateCompanySettings} className="panel p-4 space-y-3">
        <div>
          <label className="label">Timezone</label>
          <input className="input" name="timezone" defaultValue={company.timezone} />
        </div>
        <div>
          <label className="label">Daily status start (HH:mm)</label>
          <input className="input" name="statusWindowStart" defaultValue={company.statusWindowStart} />
        </div>
        <div>
          <label className="label">Window length (hours)</label>
          <input
            className="input"
            name="statusWindowHours"
            type="number"
            min={1}
            max={8}
            defaultValue={company.statusWindowHours}
          />
          <p className="text-xs text-[var(--muted)] mt-1">Plan default is 2 hours from start.</p>
        </div>
        <div>
          <label className="label">Weekly report time</label>
          <input className="input" name="weeklyReportTime" defaultValue={company.weeklyReportTime} />
        </div>
        <div>
          <label className="label">Deadline warn days (comma-separated)</label>
          <input className="input" name="deadlineWarnDays" defaultValue={company.deadlineWarnDays} />
        </div>
        <button className="btn" type="submit">
          Save settings
        </button>
      </form>
      ) : (
        <p className="text-sm text-[var(--muted)]">View only — your role cannot edit settings.</p>
      )}
    </div>
  );
}
