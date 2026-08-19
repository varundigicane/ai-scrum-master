import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";
import { isAiParseEnabled } from "@/lib/teams/config";
import { getTeamsConfig } from "@/lib/teams/link";
import { resolveTeamsEnv, resolveOpenAi } from "@/lib/company-config";
import {
  deleteChannelLink,
  deleteIdentity,
  installTeamsAppForResource,
  linkResourceIdentity,
  runTeamsRelayNow,
  sendTeamsTestMessage,
  setIdentityMuted,
  updateChannelLink,
} from "./actions";

const NOTIFY_TYPES = [
  { key: "status_submitted", label: "Status submitted" },
  { key: "status_blocker", label: "Blockers" },
  { key: "status_missed", label: "Missed submissions" },
  { key: "deadline_overdue", label: "Overdue deadlines" },
  { key: "deadline_approaching", label: "Approaching deadlines" },
  { key: "weekly_project", label: "Weekly project pack" },
  { key: "weekly_company", label: "Weekly company digest" },
];

export default async function TeamsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const companyId = session.user.companyId;
  if (!(await hasFeature(companyId, session.user.role, "teams"))) {
    redirect("/dashboard");
  }
  const canManage = await hasFeature(companyId, session.user.role, "manage_teams");

  const config = await getTeamsConfig(companyId);
  const teamsEnv = await resolveTeamsEnv(companyId);
  const ai = await resolveOpenAi(companyId);
  const [identities, channels, resources, projects, interactions, recentSends] = await Promise.all([
    prisma.teamsIdentity.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
    prisma.teamsChannelLink.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } }),
    prisma.resource.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.project.findMany({
      where: { account: { companyId }, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.teamsInteraction.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.teamsMessageLog.findMany({
      where: { companyId },
      orderBy: { sentAt: "desc" },
      take: 15,
    }),
  ]);

  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const linkedResourceIds = new Set(
    identities.map((i) => i.resourceId).filter((id): id is string => id !== null),
  );
  const unlinkedIdentities = identities.filter((i) => !i.resourceId);
  const resourcesWithoutTeams = resources.filter((r) => !linkedResourceIds.has(r.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">MS Teams</h2>
        <p className="text-sm text-[var(--muted)]">
          The bot collects daily status in Teams and relays blockers, misses, deadlines and weekly
          packs. Email keeps working exactly as before. Configure bot credentials and agent options
          in{" "}
          <a className="text-sky-600 hover:underline" href="/dashboard/settings">
            Settings → MS Teams
          </a>
          .
        </p>
      </div>

      <div className="panel p-4 space-y-2 text-sm">
        <p className="font-medium">Status</p>
        <p className="text-[var(--muted)]">
          Agent:{" "}
          {config.enabled ? (
            <span className="text-emerald-600">enabled</span>
          ) : (
            <span className="text-amber-700">disabled — turn on in Settings</span>
          )}
          {" · "}
          Bot credentials:{" "}
          {teamsEnv ? (
            <span className="text-emerald-600">configured</span>
          ) : (
            <span className="text-amber-700">missing — set in Settings</span>
          )}
        </p>
        <p className="text-[var(--muted)]">
          Free-text AI parsing:{" "}
          {ai.aiParseEnabled || isAiParseEnabled() ? (
            <span className="text-emerald-600">on</span>
          ) : (
            <span>off — configure AI in Settings</span>
          )}
        </p>
        <p className="text-[var(--muted)]">
          Messaging endpoint: <code className="text-teal-700">/api/teams/messages</code> · Relay:{" "}
          <code className="text-teal-700">POST /api/teams/cron</code>
        </p>
      </div>

      {!canManage ? (
        <p className="text-sm text-[var(--muted)]">View only — your role cannot manage Teams.</p>
      ) : null}

      {canManage ? (
        <form action={runTeamsRelayNow} className="panel p-4 space-y-2">
          <p className="font-medium">Run the relay now</p>
          <p className="text-sm text-[var(--muted)]">
            Sends any pending chases, reminders, blockers, misses, deadlines and weekly packs. Safe
            to run repeatedly — every send is deduped.
          </p>
          <button className="btn" type="submit">
            Run relay
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold">Linked people</h3>
          <p className="text-xs text-[var(--muted)]">
            {identities.length} Teams user(s) · {unlinkedIdentities.length} unlinked
          </p>
        </div>

        {identities.length === 0 ? (
          <p className="panel p-4 text-sm text-[var(--muted)]">
            Nobody has messaged or installed the bot yet. Install the Teams app, say hello to the
            bot, and the person appears here.
          </p>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted)]">
                <tr>
                  <th className="p-3">Teams user</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Linked resource</th>
                  <th className="p-3">DM ready</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {identities.map((identity) => {
                  const linked = identity.resourceId ? resourceById.get(identity.resourceId) : null;
                  return (
                    <tr key={identity.id} className="border-t border-[var(--border)]">
                      <td className="p-3">{identity.displayName ?? identity.aadObjectId}</td>
                      <td className="p-3 text-[var(--muted)]">{identity.upn ?? "—"}</td>
                      <td className="p-3">
                        {canManage ? (
                          <form action={linkResourceIdentity} className="flex gap-2">
                            <input type="hidden" name="identityId" value={identity.id} />
                            <select
                              className="input py-1"
                              name="resourceId"
                              defaultValue={identity.resourceId ?? ""}
                            >
                              <option value="">— not linked —</option>
                              {resources.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.email})
                                </option>
                              ))}
                            </select>
                            <button className="btn-secondary btn py-1 text-xs" type="submit">
                              Save
                            </button>
                          </form>
                        ) : (
                          (linked?.name ?? "—")
                        )}
                      </td>
                      <td className="p-3">
                        {identity.conversationRef ? (
                          identity.optedOut ? (
                            <span className="text-amber-300">muted</span>
                          ) : (
                            <span className="text-emerald-300">yes</span>
                          )
                        ) : (
                          <span className="text-[var(--muted)]">no</span>
                        )}
                      </td>
                      <td className="p-3">
                        {canManage ? (
                          <div className="flex flex-wrap gap-2">
                            <form action={sendTeamsTestMessage}>
                              <input type="hidden" name="kind" value="identity" />
                              <input type="hidden" name="targetId" value={identity.id} />
                              <button className="btn-secondary btn py-1 text-xs" type="submit">
                                Test
                              </button>
                            </form>
                            <form action={setIdentityMuted}>
                              <input type="hidden" name="identityId" value={identity.id} />
                              <button className="btn-secondary btn py-1 text-xs" type="submit">
                                {identity.optedOut ? "Unmute" : "Mute"}
                              </button>
                            </form>
                            <form action={deleteIdentity}>
                              <input type="hidden" name="identityId" value={identity.id} />
                              <button className="btn-secondary btn py-1 text-xs" type="submit">
                                Remove
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {resourcesWithoutTeams.length > 0 ? (
          <div className="panel p-4 space-y-3">
            <p className="text-sm text-amber-300">
              No Teams link yet for {resourcesWithoutTeams.length} active resource(s). They keep
              receiving email only.
            </p>
            {canManage ? (
              <>
                <p className="text-xs text-[var(--muted)]">
                  Push the app to someone who has never opened it. Teams sends the bot an install
                  event, which creates their link automatically. Needs the app in your org catalog
                  plus admin consent for TeamsAppInstallation.
                </p>
                <div className="flex flex-wrap gap-2">
                  {resourcesWithoutTeams.map((r) => (
                    <form key={r.id} action={installTeamsAppForResource}>
                      <input type="hidden" name="resourceId" value={r.id} />
                      <button className="btn-secondary btn py-1 text-xs" type="submit">
                        Install for {r.name}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Connected channels</h3>
        {channels.length === 0 ? (
          <p className="panel p-4 text-sm text-[var(--muted)]">
            Add the app to a team or channel and mention it once. The conversation is captured here,
            then you can choose which notifications it receives.
          </p>
        ) : (
          <div className="space-y-3">
            {channels.map((link) => {
              const selected = link.notifyTypes.split(",").map((t) => t.trim());
              return (
                <form key={link.id} action={updateChannelLink} className="panel p-4 space-y-3">
                  <input type="hidden" name="linkId" value={link.id} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{link.name ?? link.conversationId}</p>
                    <span className="text-xs text-[var(--muted)]">{link.scope}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Scope to project</label>
                      <select className="input" name="projectId" defaultValue={link.projectId ?? ""}>
                        <option value="">All projects</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-end gap-2 text-sm pb-2">
                      <input type="checkbox" name="active" defaultChecked={link.active} />
                      Active
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {NOTIFY_TYPES.map((t) => (
                      <label key={t.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="notifyTypes"
                          value={t.key}
                          defaultChecked={selected.includes(t.key)}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn" type="submit">
                        Save
                      </button>
                      <button
                        className="btn-secondary btn"
                        type="submit"
                        formAction={sendTeamsTestMessage}
                        name="kind"
                        value="channel"
                      >
                        Send test
                      </button>
                      <button className="btn-secondary btn" type="submit" formAction={deleteChannelLink}>
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <input type="hidden" name="targetId" value={link.id} />
                </form>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Recent bot activity</h3>
          {interactions.length === 0 ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">No commands yet.</p>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Command</th>
                    <th className="p-3">Outcome</th>
                    <th className="p-3">Input</th>
                  </tr>
                </thead>
                <tbody>
                  {interactions.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border)]">
                      <td className="p-3 whitespace-nowrap text-[var(--muted)]">
                        {row.createdAt.toLocaleString()}
                      </td>
                      <td className="p-3">{row.command}</td>
                      <td className="p-3">
                        <span
                          className={
                            row.outcome === "ok"
                              ? "text-emerald-300"
                              : row.outcome === "rejected"
                                ? "text-amber-300"
                                : "text-rose-300"
                          }
                        >
                          {row.outcome}
                        </span>
                        {row.errorMessage ? (
                          <span className="text-xs text-[var(--muted)]"> · {row.errorMessage}</span>
                        ) : null}
                      </td>
                      <td className="p-3 text-[var(--muted)] max-w-[16rem] truncate">
                        {row.inputText ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Recent sends</h3>
          {recentSends.length === 0 ? (
            <p className="panel p-4 text-sm text-[var(--muted)]">Nothing sent yet.</p>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">To</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSends.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border)]">
                      <td className="p-3 whitespace-nowrap text-[var(--muted)]">
                        {row.sentAt.toLocaleString()}
                      </td>
                      <td className="p-3">{row.type}</td>
                      <td className="p-3 text-[var(--muted)]">{row.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
