import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  periodBounds,
  plannedDaysInPeriod,
  plannedHoursInPeriod,
  taskEstimateDays,
  taskOverlapsPeriod,
  type WorkPeriod,
} from "@/lib/workboard";

export default async function WorkboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    period?: string;
    projectId?: string;
    resourceId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasFeature(session.user.companyId, session.user.role, "workboard"))) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const view = sp.view === "resource" ? "resource" : "project";
  const period = (["day", "week", "month", "quarter", "year"].includes(sp.period ?? "")
    ? sp.period
    : "week") as WorkPeriod;
  const { start, end, label } = periodBounds(period);
  const companyId = session.user.companyId;

  const [projects, resources] = await Promise.all([
    prisma.project.findMany({
      where: { account: { companyId }, active: true },
      include: { account: true },
      orderBy: { name: "asc" },
    }),
    prisma.resource.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const projectId = sp.projectId || projects[0]?.id || "";
  const resourceId = sp.resourceId || "";

  const requirements = projectId
    ? await prisma.requirement.findMany({
        where: { projectId },
        include: {
          children: true,
          tasks: {
            include: {
              resource: true,
              children: { include: { resource: true } },
            },
            where: { kind: "task" },
          },
        },
        orderBy: [{ kind: "asc" }, { title: "asc" }],
      })
    : [];

  const allTasks = await prisma.task.findMany({
    where: {
      project: { account: { companyId } },
      ...(projectId ? { projectId } : {}),
      ...(view === "resource" && resourceId ? { resourceId } : {}),
    },
    include: {
      resource: true,
      project: { include: { account: true } },
      requirement: true,
      parent: true,
      children: true,
      dailyItems: {
        where: {
          dailyStatus: { date: { gte: start, lte: end } },
        },
        include: { dailyStatus: true },
      },
    },
    orderBy: [{ phase: "asc" }, { title: "asc" }],
  });

  const tasks = allTasks.filter((t) => taskOverlapsPeriod(t, start, end));

  const epics = requirements.filter((r) => r.kind === "epic");
  const features = requirements.filter((r) => r.kind === "feature");
  const stories = requirements.filter((r) => r.kind === "story");

  function actualHours(taskId: string) {
    const t = allTasks.find((x) => x.id === taskId);
    if (!t) return 0;
    return t.dailyItems.reduce((s, i) => s + i.hours, 0);
  }

  function fmtDays(n: number) {
    return n.toFixed(n % 1 === 0 ? 0 : 2);
  }

  const totals = tasks.reduce(
    (acc, t) => {
      const plannedH = plannedHoursInPeriod(t, start, end);
      const actualH = t.dailyItems.reduce((s, i) => s + i.hours, 0);
      acc.estDays += taskEstimateDays(t);
      acc.plannedDays += plannedDaysInPeriod(t, start, end);
      acc.plannedHours += plannedH;
      acc.actualHours += actualH;
      return acc;
    },
    { estDays: 0, plannedDays: 0, plannedHours: 0, actualHours: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Work breakdown</h2>
        <p className="text-sm text-[var(--muted)]">
          Epic → Feature → Story → Task → Subtask · estimate (days) matched to {label.toLowerCase()}{" "}
          vs daily status hours
        </p>
      </div>

      <form method="get" className="panel p-4 grid gap-3 md:grid-cols-5">
        <div>
          <label className="label">View</label>
          <select className="input" name="view" defaultValue={view}>
            <option value="project">Project wise</option>
            <option value="resource">Resource wise</option>
          </select>
        </div>
        <div>
          <label className="label">Period</label>
          <select className="input" name="period" defaultValue={period}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select className="input" name="projectId" defaultValue={projectId}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.account.name} / {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Resource</label>
          <select className="input" name="resourceId" defaultValue={resourceId} disabled={view !== "resource"}>
            <option value="">All</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.employeeId ? `${r.employeeId} — ` : ""}
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn" type="submit">
            Apply
          </button>
        </div>
      </form>

      <p className="text-xs text-[var(--muted)]">
        Period window: {start.toISOString().slice(0, 10)} → {end.toISOString().slice(0, 10)} · 1
        estimate day = 8h · Planned = estimate prorated by task start/end overlap with this{" "}
        {label.toLowerCase()}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-3">
          <p className="text-xs text-[var(--muted)]">Total estimate</p>
          <p className="text-lg font-semibold">{fmtDays(totals.estDays)} d</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs text-[var(--muted)]">Planned ({label})</p>
          <p className="text-lg font-semibold">
            {fmtDays(totals.plannedDays)} d · {totals.plannedHours.toFixed(1)}h
          </p>
        </div>
        <div className="panel p-3">
          <p className="text-xs text-[var(--muted)]">Actual status ({label})</p>
          <p className="text-lg font-semibold">{totals.actualHours.toFixed(1)}h</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs text-[var(--muted)]">Variance ({label})</p>
          <p className="text-lg font-semibold">
            {(totals.actualHours - totals.plannedHours).toFixed(1)}h
          </p>
        </div>
      </div>

      <section className="panel p-4 space-y-4">
        <h3 className="font-semibold">Hierarchy · Epic / Feature / Story</h3>
        {epics.length === 0 && features.length === 0 && stories.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No backlog items yet. Add Epic/Feature/Story on the{" "}
            <Link
              className="text-sky-300"
              href={projectId ? `/dashboard/projects/${projectId}/backlog` : "/dashboard/backlog"}
            >
              backlog manager
            </Link>
            .
          </p>
        ) : null}
        {epics.map((epic) => (
          <div key={epic.id} className="border border-[var(--border)] rounded-xl p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="badge">Epic</span>
              <strong>{epic.title}</strong>
            </div>
            {features
              .filter((f) => f.parentId === epic.id)
              .map((feature) => (
                <div key={feature.id} className="ml-4 border-l border-[var(--border)] pl-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="badge">Feature</span>
                    <span>{feature.title}</span>
                  </div>
                  {stories
                    .filter((s) => s.parentId === feature.id)
                    .map((story) => (
                      <div key={story.id} className="ml-4 space-y-1">
                        <div className="flex gap-2 items-center text-sm">
                          <span className="badge">Story</span>
                          <span>{story.title}</span>
                        </div>
                        {story.tasks.map((t) => {
                          const plannedD = plannedDaysInPeriod(t, start, end);
                          const plannedH = plannedHoursInPeriod(t, start, end);
                          const actualH = actualHours(t.id);
                          return (
                            <div key={t.id} className="ml-4 text-sm text-[var(--muted)]">
                              Task: {t.title} · {t.phase} · {t.resource?.name ?? "Unassigned"} · Est{" "}
                              {fmtDays(taskEstimateDays(t))}d · Planned {fmtDays(plannedD)}d (
                              {plannedH.toFixed(1)}h) · Actual {actualH.toFixed(1)}h ({label})
                              {t.children.map((c) => (
                                <div key={c.id} className="ml-4">
                                  Subtask: {c.title} · Est {fmtDays(taskEstimateDays(c))}d · Actual{" "}
                                  {actualHours(c.id).toFixed(1)}h
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ))}
          </div>
        ))}
        {features
          .filter((f) => !f.parentId || !epics.some((e) => e.id === f.parentId))
          .map((feature) => (
            <div key={feature.id} className="border border-[var(--border)] rounded-xl p-3">
              <span className="badge">Feature</span> {feature.title}
            </div>
          ))}
        {stories
          .filter((s) => !s.parentId || !features.some((f) => f.id === s.parentId))
          .map((story) => (
            <div key={story.id} className="border border-[var(--border)] rounded-xl p-3">
              <span className="badge">Story</span> {story.title}
            </div>
          ))}
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">
          Tasks &amp; subtasks · {view === "resource" ? "Resource" : "Project"} · {label}
        </h3>
        <table className="table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Phase</th>
              <th>Project</th>
              <th>Resource</th>
              <th>Dates</th>
              <th>Est (d)</th>
              <th>Planned ({label})</th>
              <th>Actual ({label})</th>
              <th>Var (h)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const plannedD = plannedDaysInPeriod(t, start, end);
              const plannedH = plannedHoursInPeriod(t, start, end);
              const actualH = t.dailyItems.reduce((s, i) => s + i.hours, 0);
              const variance = actualH - plannedH;
              return (
                <tr key={t.id}>
                  <td>
                    <span className="badge">{t.kind}</span>
                  </td>
                  <td>
                    {t.parent ? <span className="text-[var(--muted)]">↳ </span> : null}
                    {t.title}
                    {t.description ? (
                      <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{t.description}</p>
                    ) : null}
                  </td>
                  <td>
                    <span className="badge">{t.phase}</span>
                  </td>
                  <td className="text-sm">
                    {t.project.account.name}/{t.project.name}
                  </td>
                  <td>{t.resource?.name ?? "—"}</td>
                  <td className="text-xs whitespace-nowrap">
                    {(t.startDate?.toISOString().slice(0, 10) ?? "—") +
                      " → " +
                      (t.endDate?.toISOString().slice(0, 10) ?? "—")}
                  </td>
                  <td>{t.estimateDays != null ? fmtDays(t.estimateDays) : "—"}</td>
                  <td>
                    {fmtDays(plannedD)}d · {plannedH.toFixed(1)}h
                  </td>
                  <td>{actualH.toFixed(1)}h</td>
                  <td className={variance > 0.5 ? "text-amber-300" : variance < -0.5 ? "text-sky-300" : ""}>
                    {variance.toFixed(1)}
                  </td>
                  <td>
                    <span className="badge">{t.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
