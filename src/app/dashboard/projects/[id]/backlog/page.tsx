import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/project-access";
import {
  createRequirement,
  createTask,
  deleteRequirement,
  deleteTask,
  updateRequirement,
  updateTask,
} from "@/app/actions";
import { workItemLabel } from "@/lib/work-item-id";

const PHASES = ["Requirements", "Design", "Dev", "Test", "UAT", "Closed"] as const;
const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;

export default async function ProjectBacklogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  let access;
  try {
    access = await getProjectAccess(projectId);
  } catch {
    notFound();
  }

  const { project, canEditAll, canUpdateOwnTasks, myResource } = access;

  const [requirements, tasks] = await Promise.all([
    prisma.requirement.findMany({
      where: { projectId },
      orderBy: [{ kind: "asc" }, { title: "asc" }],
    }),
    prisma.task.findMany({
      where: { projectId },
      include: { resource: true, requirement: true, parent: true },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  const parentTasks = tasks.filter((t) => t.kind === "task");
  const editableTask = (taskResourceId: string | null) =>
    canEditAll || (myResource && taskResourceId === myResource.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link href={`/dashboard/projects/${projectId}`} className="text-sky-300 hover:underline">
              ← {project.account.name} / {project.name}
            </Link>
          </p>
          <h2 className="text-2xl font-semibold mt-1">Backlog &amp; tasks</h2>
          <p className="text-sm text-[var(--muted)]">
            Add / update / delete Epic, Feature, Story, Task, Subtask · assign resources
            {canEditAll
              ? " (full PM access)"
              : myResource
                ? ` (your tasks as ${myResource.name})`
                : " (view only)"}
          </p>
        </div>
        <Link href="/dashboard/workboard" className="btn btn-secondary text-sm">
          Work breakdown board
        </Link>
      </div>

      {/* LIST: Epics / Features / Stories */}
      <section className="panel overflow-x-auto p-4 space-y-3">
        <h3 className="font-semibold">List · Epic / Feature / Story</h3>
        {requirements.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No backlog items yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>ID</th>
                <th>Title</th>
                <th>Parent</th>
                <th>Closed</th>
                {canEditAll ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => {
                const parent = requirements.find((p) => p.id === r.parentId);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="badge">{r.kind}</span>
                    </td>
                    <td className="font-mono text-sm text-sky-300">{r.displayId ?? "—"}</td>
                    <td>{r.title}</td>
                    <td className="text-sm">
                      {parent ? `${parent.kind}: ${workItemLabel(parent.displayId, parent.title)}` : "—"}
                    </td>
                    <td>{r.closed ? "Yes" : "No"}</td>
                    {canEditAll ? (
                      <td className="align-top">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-sky-300">Edit / Delete</summary>
                          <form action={updateRequirement} className="mt-2 grid gap-2 min-w-[280px]">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="requirementId" value={r.id} />
                            <input className="input" name="title" defaultValue={r.title} required />
                            <select className="input" name="kind" defaultValue={r.kind}>
                              <option value="epic">Epic</option>
                              <option value="feature">Feature</option>
                              <option value="story">Story</option>
                            </select>
                            <select className="input" name="parentId" defaultValue={r.parentId ?? ""}>
                              <option value="">No parent</option>
                              {requirements
                                .filter((p) => p.id !== r.id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {workItemLabel(p.displayId, p.title)} ({p.kind})
                                  </option>
                                ))}
                            </select>
                            <select className="input" name="closed" defaultValue={r.closed ? "yes" : "no"}>
                              <option value="no">Open</option>
                              <option value="yes">Closed</option>
                            </select>
                            <input
                              className="input"
                              name="description"
                              defaultValue={r.description ?? ""}
                              placeholder="Description"
                            />
                            <button className="btn text-sm" type="submit">
                              Update
                            </button>
                          </form>
                          <form action={deleteRequirement} className="mt-2">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="requirementId" value={r.id} />
                            <button className="btn btn-secondary text-sm" type="submit">
                              Delete
                            </button>
                          </form>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {canEditAll ? (
        <form action={createRequirement} className="panel p-4 grid gap-3 md:grid-cols-4">
          <h3 className="md:col-span-4 font-semibold">Add Epic / Feature / Story</h3>
          <input type="hidden" name="projectId" value={projectId} />
          <div>
            <label className="label">Kind</label>
            <select className="input" name="kind" defaultValue="story">
              <option value="epic">Epic</option>
              <option value="feature">Feature</option>
              <option value="story">Story</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input className="input" name="title" required />
          </div>
          <div>
            <label className="label">Parent</label>
            <select className="input" name="parentId" defaultValue="">
              <option value="">None</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind}: {workItemLabel(r.displayId, r.title)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="label">Description</label>
            <input className="input" name="description" />
          </div>
          <div className="md:col-span-4">
            <button className="btn" type="submit">
              Add backlog item
            </button>
          </div>
        </form>
      ) : null}

      {/* LIST: Tasks / Subtasks */}
      <section className="panel overflow-x-auto p-4 space-y-3">
        <h3 className="font-semibold">List · Task / Subtask</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No tasks yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>ID</th>
                <th>Title</th>
                <th>Phase</th>
                <th>Assignee</th>
                <th>Est (days)</th>
                <th>Dates</th>
                <th>Progress</th>
                <th>Status</th>
                {canUpdateOwnTasks ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="badge">{t.kind}</span>
                  </td>
                  <td className="font-mono text-sm text-sky-300">{t.displayId ?? "—"}</td>
                  <td>
                    {t.parent ? (
                      <span className="text-[var(--muted)]">
                        ↳ {workItemLabel(t.parent.displayId, t.parent.title)} /{" "}
                      </span>
                    ) : null}
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
                  <td>
                    <span className="badge">{t.status}</span>
                  </td>
                  {canUpdateOwnTasks ? (
                    <td className="align-top">
                      {editableTask(t.resourceId) ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-sky-300">Edit / Delete</summary>
                          <form action={updateTask} className="mt-2 grid gap-2 min-w-[300px]">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="taskId" value={t.id} />
                            <input className="input" name="title" defaultValue={t.title} required />
                            <textarea
                              className="input min-h-[72px]"
                              name="description"
                              placeholder="Description"
                              defaultValue={t.description ?? ""}
                            />
                            <select className="input" name="kind" defaultValue={t.kind}>
                              <option value="task">Task</option>
                              <option value="subtask">Subtask</option>
                            </select>
                            <select className="input" name="parentId" defaultValue={t.parentId ?? ""}>
                              <option value="">No parent</option>
                              {parentTasks
                                .filter((p) => p.id !== t.id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {workItemLabel(p.displayId, p.title)}
                                  </option>
                                ))}
                            </select>
                            <select className="input" name="phase" defaultValue={t.phase}>
                              {PHASES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                            <select
                              className="input"
                              name="resourceId"
                              defaultValue={t.resourceId ?? ""}
                              disabled={!canEditAll}
                            >
                              <option value="">Unassigned</option>
                              {project.assignments.map((a) => (
                                <option key={a.resourceId} value={a.resourceId}>
                                  {a.resource.name}
                                </option>
                              ))}
                            </select>
                            <select className="input" name="requirementId" defaultValue={t.requirementId ?? ""}>
                              <option value="">No story link</option>
                              {requirements.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.kind}: {workItemLabel(r.displayId, r.title)}
                                </option>
                              ))}
                            </select>
                            <input
                              className="input"
                              type="number"
                              name="estimateDays"
                              min={0}
                              step={0.25}
                              placeholder="Estimate (days)"
                              defaultValue={t.estimateDays ?? ""}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                className="input"
                                type="date"
                                name="startDate"
                                title="Start date"
                                defaultValue={t.startDate?.toISOString().slice(0, 10) ?? ""}
                              />
                              <input
                                className="input"
                                type="date"
                                name="endDate"
                                title="End date"
                                defaultValue={t.endDate?.toISOString().slice(0, 10) ?? ""}
                              />
                            </div>
                            <input
                              className="input"
                              type="number"
                              name="progressPct"
                              min={0}
                              max={100}
                              defaultValue={t.progressPct}
                            />
                            <select className="input" name="status" defaultValue={t.status}>
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                className="input"
                                type="date"
                                name="clientDeadline"
                                title="Client deadline"
                                defaultValue={t.clientDeadline?.toISOString().slice(0, 10) ?? ""}
                              />
                              <input
                                className="input"
                                type="date"
                                name="resourceDeadline"
                                title="Resource deadline"
                                defaultValue={t.resourceDeadline?.toISOString().slice(0, 10) ?? ""}
                              />
                            </div>
                            <button className="btn text-sm" type="submit">
                              Update
                            </button>
                          </form>
                          <form action={deleteTask} className="mt-2">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="taskId" value={t.id} />
                            <button className="btn btn-secondary text-sm" type="submit">
                              Delete
                            </button>
                          </form>
                        </details>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canUpdateOwnTasks ? (
        <form action={createTask} className="panel p-4 grid gap-3 md:grid-cols-3">
          <h3 className="md:col-span-3 font-semibold">Add Task / Subtask</h3>
          <input type="hidden" name="projectId" value={projectId} />
          <div>
            <label className="label">Kind</label>
            <select className="input" name="kind" defaultValue="task">
              <option value="task">Task</option>
              <option value="subtask">Subtask</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input className="input" name="title" required />
          </div>
          <div className="md:col-span-3">
            <label className="label">Description</label>
            <textarea className="input min-h-[72px]" name="description" placeholder="What needs to be done" />
          </div>
          <div>
            <label className="label">Parent task</label>
            <select className="input" name="parentId" defaultValue="">
              <option value="">None</option>
              {parentTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {workItemLabel(t.displayId, t.title)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Phase</label>
            <select className="input" name="phase" defaultValue={project.phase}>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Assign resource</label>
            <select
              className="input"
              name="resourceId"
              defaultValue={myResource && !canEditAll ? myResource.id : ""}
              disabled={!canEditAll}
            >
              <option value="">Unassigned</option>
              {project.assignments.map((a) => (
                <option key={a.resourceId} value={a.resourceId}>
                  {a.resource.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Link story / feature</label>
            <select className="input" name="requirementId" defaultValue="">
              <option value="">None</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind}: {workItemLabel(r.displayId, r.title)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Estimate (days)</label>
            <input className="input" type="number" name="estimateDays" min={0} step={0.25} placeholder="e.g. 3" />
          </div>
          <div>
            <label className="label">Start date</label>
            <input className="input" type="date" name="startDate" />
          </div>
          <div>
            <label className="label">End date</label>
            <input className="input" type="date" name="endDate" />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" name="status" defaultValue="todo">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Progress %</label>
            <input className="input" type="number" name="progressPct" defaultValue={0} min={0} max={100} />
          </div>
          <div>
            <label className="label">Client deadline</label>
            <input className="input" type="date" name="clientDeadline" />
          </div>
          <div>
            <label className="label">Resource deadline</label>
            <input className="input" type="date" name="resourceDeadline" />
          </div>
          <div className="md:col-span-3">
            <button className="btn" type="submit">
              Add task
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
