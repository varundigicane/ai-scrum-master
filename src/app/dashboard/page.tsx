import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  const companyId = session!.user.companyId;

  const [accounts, projects, resources, openDefects, pendingRequests, overdueTasks, weekly] =
    await Promise.all([
      prisma.account.count({ where: { companyId, active: true } }),
      prisma.project.count({ where: { account: { companyId }, active: true } }),
      prisma.resource.count({ where: { companyId, active: true } }),
      prisma.defect.count({
        where: {
          project: { account: { companyId } },
          status: { not: "closed" },
        },
      }),
      prisma.statusRequest.count({
        where: { state: "pending", resource: { companyId } },
      }),
      prisma.task.count({
        where: {
          status: { not: "done" },
          project: { account: { companyId } },
          OR: [{ clientDeadline: { lt: new Date() } }, { resourceDeadline: { lt: new Date() } }],
        },
      }),
      prisma.weeklyReport.findMany({
        where: { companyId },
        orderBy: { generatedAt: "desc" },
        take: 5,
      }),
    ]);

  const projectRows = await prisma.project.findMany({
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
  });

  const cards = [
    { label: "Accounts", value: accounts, href: "/dashboard/accounts" },
    { label: "Projects", value: projects, href: "/dashboard/projects" },
    { label: "Resources", value: resources, href: "/dashboard/resources" },
    { label: "Overdue tasks", value: overdueTasks, href: "/dashboard/projects" },
    { label: "Open defects", value: openDefects, href: "/dashboard/projects" },
    { label: "Pending status", value: pendingRequests, href: "/dashboard/status" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Company matrix</h2>
        <p className="text-[var(--muted)] text-sm mt-1">
          High-level health across accounts, projects, and resources.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="panel p-4 hover:border-teal-500/40 transition">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</p>
            <p className="text-3xl font-semibold mt-2">{c.value}</p>
          </Link>
        ))}
      </div>

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
              const overdue = p.tasks.filter(
                (t) =>
                  t.status !== "done" &&
                  ((t.clientDeadline && t.clientDeadline < new Date()) ||
                    (t.resourceDeadline && t.resourceDeadline < new Date())),
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
              const rag =
                overdue > 0 ? "Red" : openDef > 0 && p.defects.some((d) => d.severity === "critical") ? "Amber" : "Green";
              return (
                <tr key={p.id}>
                  <td>{p.account.name}</td>
                  <td>
                    <Link className="text-sky-300 hover:underline" href={`/dashboard/projects/${p.id}`}>
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
                    <span
                      className="badge"
                      style={{
                        color: rag === "Red" ? "#fb7185" : rag === "Amber" ? "#fbbf24" : "#34d399",
                      }}
                    >
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent weekly reports</h3>
          <Link href="/dashboard/reports" className="text-sm text-sky-300">
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
