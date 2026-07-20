import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createDefect,
  createRca,
  createRequirement,
  createTask,
  createTestCase,
  updateProjectBilling,
} from "@/app/actions";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const project = await prisma.project.findFirst({
    where: { id, account: { companyId: session!.user.companyId } },
    include: {
      account: true,
      assignments: { include: { resource: true } },
      tasks: { include: { resource: true }, orderBy: { updatedAt: "desc" } },
      requirements: { orderBy: [{ level: "asc" }, { title: "asc" }] },
      testCases: { include: { requirement: true } },
      defects: { include: { rca: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const closedReqs = project.requirements.filter((r) => r.closed).length;
  const density =
    closedReqs === 0
      ? project.defects.length
      : Number((project.defects.length / closedReqs).toFixed(2));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted)]">
          {project.account.name} · {project.phase}
        </p>
        <h2 className="text-2xl font-semibold">{project.name}</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Defect density (defects / closed requirements): <strong>{density}</strong>
          {" · "}
          Billable: <strong>{project.billable ? "Yes" : "No"}</strong>
          {" · "}
          {(project.startDate?.toISOString().slice(0, 10) ?? "—") +
            " → " +
            (project.endDate?.toISOString().slice(0, 10) ?? "—")}
        </p>
        <p className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/projects/${project.id}/backlog`}
            className="btn text-sm inline-flex"
          >
            Manage Epic / Story / Task
          </Link>
          <Link href="/dashboard/backlog" className="btn btn-secondary text-sm inline-flex">
            All projects backlog
          </Link>
        </p>
      </div>

      <section className="panel p-4 border-teal-500/40">
        <h3 className="font-semibold text-lg mb-1">Epic · Feature · Story · Task</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Use the backlog manager to add, update, delete, and assign work items for this project.
        </p>
        <Link href={`/dashboard/projects/${project.id}/backlog`} className="btn">
          Open backlog manager
        </Link>
      </section>

      <form action={updateProjectBilling} className="panel p-4 grid gap-3 md:grid-cols-4">
        <input type="hidden" name="projectId" value={project.id} />
        <div>
          <label className="label">Start date</label>
          <input
            className="input"
            type="date"
            name="startDate"
            defaultValue={project.startDate?.toISOString().slice(0, 10) ?? ""}
          />
        </div>
        <div>
          <label className="label">End date</label>
          <input
            className="input"
            type="date"
            name="endDate"
            defaultValue={project.endDate?.toISOString().slice(0, 10) ?? ""}
          />
        </div>
        <div>
          <label className="label">Billable</label>
          <select className="input" name="billable" defaultValue={project.billable ? "yes" : "no"}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn btn-secondary" type="submit">
            Save billing dates
          </button>
        </div>
      </form>

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={createTask} className="panel p-4 space-y-3">
          <h3 className="font-semibold">Add task / subtask</h3>
          <input type="hidden" name="projectId" value={project.id} />
          <input className="input" name="title" placeholder="Task title" required />
          <textarea
            className="input min-h-[72px]"
            name="description"
            placeholder="Description"
          />
          <select className="input" name="kind" defaultValue="task">
            <option value="task">Task</option>
            <option value="subtask">Subtask</option>
          </select>
          <select className="input" name="parentId" defaultValue="">
            <option value="">Parent task (for subtask)</option>
            {project.tasks
              .filter((t) => t.kind === "task")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
          <select className="input" name="phase" defaultValue={project.phase}>
            {["Requirements", "Design", "Dev", "Test", "UAT", "Closed"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select className="input" name="resourceId" defaultValue="">
            <option value="">Unassigned</option>
            {project.assignments.map((a) => (
              <option key={a.resourceId} value={a.resourceId}>
                {a.resource.name}
              </option>
            ))}
          </select>
          <select className="input" name="requirementId" defaultValue="">
            <option value="">Link story/feature (optional)</option>
            {project.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.kind}: {r.title}
              </option>
            ))}
          </select>
          <div>
            <label className="label">Estimate (days)</label>
            <input className="input" type="number" name="estimateDays" min={0} step={0.25} placeholder="e.g. 3" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Start date</label>
              <input className="input" type="date" name="startDate" />
            </div>
            <div>
              <label className="label">End date</label>
              <input className="input" type="date" name="endDate" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Client deadline</label>
              <input className="input" type="date" name="clientDeadline" />
            </div>
            <div>
              <label className="label">Resource deadline</label>
              <input className="input" type="date" name="resourceDeadline" />
            </div>
          </div>
          <button className="btn" type="submit">
            Save task
          </button>
        </form>

        <form action={createRequirement} className="panel p-4 space-y-3">
          <h3 className="font-semibold">Add epic / feature / story</h3>
          <input type="hidden" name="projectId" value={project.id} />
          <input className="input" name="title" placeholder="Title" required />
          <select className="input" name="kind" defaultValue="story">
            <option value="epic">Epic</option>
            <option value="feature">Feature</option>
            <option value="story">Story</option>
          </select>
          <select className="input" name="parentId" defaultValue="">
            <option value="">Parent (feature under epic, story under feature)</option>
            {project.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.kind}: {r.title}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Save backlog item
          </button>
        </form>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Tasks &amp; subtasks</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Phase</th>
              <th>Owner</th>
              <th>Est (d)</th>
              <th>Dates</th>
              <th>Progress</th>
              <th>Client DL</th>
              <th>Self DL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {project.tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="badge">{t.kind}</span>
                </td>
                <td>
                  {t.title}
                  {t.description ? (
                    <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{t.description}</p>
                  ) : null}
                </td>
                <td>
                  <span className="badge">{t.phase}</span>
                </td>
                <td>{t.resource?.name ?? "—"}</td>
                <td>{t.estimateDays != null ? t.estimateDays : "—"}</td>
                <td className="text-xs whitespace-nowrap">
                  {(t.startDate?.toISOString().slice(0, 10) ?? "—") +
                    " → " +
                    (t.endDate?.toISOString().slice(0, 10) ?? "—")}
                </td>
                <td>{t.progressPct}%</td>
                <td>{t.clientDeadline?.toISOString().slice(0, 10) ?? "—"}</td>
                <td>{t.resourceDeadline?.toISOString().slice(0, 10) ?? "—"}</td>
                <td>
                  <span className="badge">{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Backlog (Epic / Feature / Story)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Closed</th>
            </tr>
          </thead>
          <tbody>
            {project.requirements.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="badge">{r.kind}</span>
                </td>
                <td>{r.title}</td>
                <td>{r.closed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form action={createTestCase} className="panel p-4 space-y-3">
          <h3 className="font-semibold">Add test case</h3>
          <input type="hidden" name="projectId" value={project.id} />
          <input className="input" name="title" required placeholder="Test case title" />
          <select className="input" name="requirementId" defaultValue="">
            <option value="">No requirement</option>
            {project.requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <select className="input" name="status" defaultValue="not_run">
            {["not_run", "pass", "fail", "blocked"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Save test case
          </button>
        </form>

        <form action={createDefect} className="panel p-4 space-y-3">
          <h3 className="font-semibold">Add defect</h3>
          <input type="hidden" name="projectId" value={project.id} />
          <input className="input" name="title" required placeholder="Defect title" />
          <select className="input" name="source" defaultValue="internal">
            <option value="internal">Internal</option>
            <option value="client_informed">Client informed</option>
          </select>
          <select className="input" name="severity" defaultValue="medium">
            {["low", "medium", "high", "critical"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Save defect
          </button>
        </form>
      </section>

      <section className="panel overflow-x-auto p-4">
        <h3 className="font-semibold mb-3">Test cases</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Requirement</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {project.testCases.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{t.requirement?.title ?? "—"}</td>
                <td>
                  <span className="badge">{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-4 space-y-4">
        <h3 className="font-semibold">Defects & RCA</h3>
        {project.defects.map((d) => (
          <div key={d.id} className="border border-[var(--border)] rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <p className="font-medium">{d.title}</p>
              <div className="flex gap-2">
                <span className="badge">{d.source}</span>
                <span className="badge">{d.severity}</span>
                <span className="badge">{d.status}</span>
              </div>
            </div>
            {d.rca ? (
              <div className="text-sm text-[var(--muted)]">
                <p>
                  <strong>RCA:</strong> {d.rca.rootCause}
                </p>
                <p>
                  <strong>Action:</strong> {d.rca.correctiveAction}
                </p>
                {d.rca.reviewNotes ? (
                  <p>
                    <strong>Review:</strong> {d.rca.reviewNotes}
                  </p>
                ) : null}
              </div>
            ) : (
              <form action={createRca} className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="defectId" value={d.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <input className="input" name="rootCause" placeholder="Root cause" required />
                <input className="input" name="correctiveAction" placeholder="Corrective action" required />
                <input className="input md:col-span-2" name="reviewNotes" placeholder="Review notes" />
                <button className="btn btn-secondary w-fit" type="submit">
                  Capture RCA / review
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
