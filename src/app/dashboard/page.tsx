import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOverviewCharts, OVERVIEW_COLORS, projectRag } from "@/lib/overview-charts";
import { OverviewCharts } from "@/components/OverviewCharts";

export default async function DashboardPage() {
  const session = await auth();
  const companyId = session!.user.companyId;

  const [charts, weekly, projectRows] = await Promise.all([
    getOverviewCharts(companyId, session!.user.id),
    prisma.weeklyReport.findMany({
      where: { companyId },
      orderBy: { generatedAt: "desc" },
      take: 5,
    }),
    prisma.project.findMany({
      where: { account: { companyId }, active: true },
      include: {
        account: true,
        tasks: true,
        defects: true,
        testCases: true,
        requirements: true,
        assignments: true,
      },
      take: 20,
    }),
  ]);

  const { kpis } = charts;
  const cards = [
    {
      label: "Accounts",
      value: kpis.accounts,
      href: "/dashboard/accounts",
      tone: "accent" as const,
    },
    {
      label: "Projects",
      value: kpis.projects,
      href: "/dashboard/projects",
      tone: "accent" as const,
    },
    {
      label: "Resources",
      value: kpis.resources,
      href: "/dashboard/resources",
      tone: "accent2" as const,
    },
    {
      label: "Due soon",
      value: kpis.dueSoonReminders,
      href: "/dashboard/meeting-notes",
      tone: kpis.dueSoonReminders > 0 ? ("warn" as const) : ("muted" as const),
    },
    {
      label: "Overdue reminders",
      value: kpis.overdueReminders,
      href: "/dashboard/meeting-notes",
      tone: kpis.overdueReminders > 0 ? ("danger" as const) : ("muted" as const),
    },
    {
      label: "Overdue tasks",
      value: kpis.overdueTasks,
      href: "/dashboard/projects",
      tone: kpis.overdueTasks > 0 ? ("danger" as const) : ("muted" as const),
    },
    {
      label: "Open defects",
      value: kpis.openDefects,
      href: "/dashboard/projects",
      tone: kpis.openDefects > 0 ? ("danger" as const) : ("muted" as const),
    },
    {
      label: "Pending status",
      value: kpis.pendingStatus,
      href: "/dashboard/status",
      tone: kpis.pendingStatus > 0 ? ("warn" as const) : ("muted" as const),
    },
  ];

  const toneColor: Record<string, string> = {
    accent: OVERVIEW_COLORS.accent,
    accent2: OVERVIEW_COLORS.accent2,
    danger: OVERVIEW_COLORS.danger,
    warn: OVERVIEW_COLORS.warn,
    muted: OVERVIEW_COLORS.muted,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Company matrix</h2>
        <p className="text-[var(--muted)] text-sm mt-1">
          High-level health across accounts, projects, and resources.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="panel p-4 hover:border-teal-500/40 transition border-l-4"
            style={{ borderLeftColor: toneColor[c.tone] }}
          >
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</p>
            <p className="text-3xl font-semibold mt-2" style={{ color: toneColor[c.tone] }}>
              {c.value}
            </p>
          </Link>
        ))}
      </div>

      <OverviewCharts data={charts} />

      <section className="panel p-4">
        <h3 className="font-semibold mb-3">Due & overdue (reminders / meetings)</h3>
        {charts.reminders.items.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing due in the next 24 hours.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {charts.reminders.items.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-wrap justify-between gap-2 border border-[var(--border)] rounded-lg p-3"
              >
                <div>
                  <span
                    className="badge mr-2"
                    style={{ color: item.overdue ? OVERVIEW_COLORS.danger : OVERVIEW_COLORS.warn }}
                  >
                    {item.overdue ? "Overdue" : "Due soon"} · {item.kind}
                  </span>
                  {item.noteId ? (
                    <Link
                      className="text-sky-700 hover:underline font-medium"
                      href={`/dashboard/meeting-notes/${item.noteId}`}
                    >
                      {item.noteTitle}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.noteTitle}</span>
                  )}
                  <p className="text-[var(--muted)] mt-1">{item.note}</p>
                </div>
                <span className="text-[var(--muted)] text-xs whitespace-nowrap">
                  {new Date(item.dueAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4 overflow-x-auto">
        <h3 className="font-semibold mb-3">Project RAG matrix</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th>Phase</th>
              <th>Resources</th>
              <th>Overdue</th>
              <th>Defects</th>
              <th>Test pass</th>
              <th>Density</th>
              <th>RAG</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.map((p) => {
              const now = new Date();
              const overdue = p.tasks.filter(
                (t) =>
                  t.status !== "done" &&
                  ((t.clientDeadline && t.clientDeadline < now) ||
                    (t.resourceDeadline && t.resourceDeadline < now)),
              ).length;
              const openDef = p.defects.filter((d) => d.status !== "closed").length;
              const pass =
                p.testCases.length === 0
                  ? "—"
                  : `${Math.round(
                      (p.testCases.filter((t) => t.status === "pass").length / p.testCases.length) *
                        100,
                    )}%`;
              const closedReqs = p.requirements.filter((r) => r.closed).length;
              const density =
                closedReqs === 0
                  ? String(p.defects.length)
                  : (p.defects.length / closedReqs).toFixed(2);
              const rag = projectRag(p);
              return (
                <tr key={p.id}>
                  <td>{p.account.name}</td>
                  <td>
                    <Link className="text-sky-700 hover:underline" href={`/dashboard/projects/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <span className="badge">{p.phase}</span>
                  </td>
                  <td>{p.assignments.length}</td>
                  <td>{overdue}</td>
                  <td>{openDef}</td>
                  <td>{pass}</td>
                  <td>{density}</td>
                  <td>
                    <span className="badge" style={{ color: OVERVIEW_COLORS.rag[rag] }}>
                      {rag}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">Recent weekly reports</h3>
          <Link href="/dashboard/reports" className="text-sm text-sky-700">
            View all
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {weekly.length === 0 ? (
            <li className="text-[var(--muted)]">No weekly packs yet — run the agent job from AI Agent.</li>
          ) : (
            weekly.map((w) => (
              <li key={w.id} className="border border-[var(--border)] rounded-lg p-3">
                <div className="flex justify-between gap-3">
                  <span className="badge">{w.scope}</span>
                  <span className="text-[var(--muted)] text-xs">
                    {w.generatedAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <p className="mt-2">{w.narrative}</p>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
