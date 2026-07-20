import Link from "next/link";
import {
  assignResource,
  createProject,
  deleteProject,
  unassignResource,
  updateProject,
} from "@/app/actions";
import { requireFeature } from "@/lib/require-feature";
import { hasFeature } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const PHASES = ["Requirements", "Design", "Dev", "Test", "UAT", "Closed"] as const;

export default async function ProjectsPage() {
  const session = await requireFeature("projects");
  const companyId = session.user.companyId;
  const canEdit = await hasFeature(companyId, session.user.role, "edit_delivery");

  const [accounts, projects, resources] = await Promise.all([
    prisma.account.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { account: { companyId } },
      include: {
        account: true,
        assignments: { where: { active: true }, include: { resource: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.resource.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Projects</h2>
        <p className="text-sm text-[var(--muted)]">
          Assign the same resource to multiple projects with a per-project hourly billing rate.
        </p>
      </div>

      {canEdit ? (
        <>
          <form action={createProject} className="panel p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="label">Account</label>
              <select className="input" name="accountId" required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Project name</label>
              <input className="input" name="name" required />
            </div>
            <div>
              <label className="label">Phase</label>
              <select className="input" name="phase" defaultValue="Dev">
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
              <label className="label">Billable</label>
              <select className="input" name="billable" defaultValue="yes">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="md:col-span-3 lg:col-span-6">
              <button className="btn" type="submit">
                Add project
              </button>
            </div>
          </form>

          <form action={assignResource} className="panel p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="label">Project</label>
              <select className="input" name="projectId" required>
                {projects
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.account.name} / {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">Resource</label>
              <select className="input" name="resourceId" required>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.employeeId ? `${r.employeeId} — ` : ""}
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Capacity %</label>
              <input className="input" name="capacityPct" type="number" defaultValue={100} min={1} max={100} />
            </div>
            <div>
              <label className="label">Billable (this project)</label>
              <select className="input" name="billable" defaultValue="yes">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="label">Billing rate (per hour)</label>
              <input className="input" name="hourlyRate" type="number" step="0.01" min={0} defaultValue={0} />
              <p className="text-xs text-[var(--muted)] mt-1">Used only if Billable = Yes</p>
            </div>
            <div className="flex items-end">
              <button className="btn btn-secondary" type="submit">
                Assign / update
              </button>
            </div>
          </form>
        </>
      ) : null}

      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th>Backlog</th>
              <th>Dates</th>
              <th>Billable</th>
              <th>Phase</th>
              <th>Status</th>
              <th>Team + rates</th>
              {canEdit ? <th>Manage</th> : null}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.account.name}</td>
                <td>
                  <Link href={`/dashboard/projects/${p.id}`} className="text-sky-300 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td>
                  <Link href={`/dashboard/projects/${p.id}/backlog`} className="btn text-sm">
                    Manage Epic / Story / Task
                  </Link>
                </td>
                <td className="text-sm">
                  {(p.startDate?.toISOString().slice(0, 10) ?? "—") +
                    " → " +
                    (p.endDate?.toISOString().slice(0, 10) ?? "—")}
                </td>
                <td>
                  <span className="badge">{p.billable ? "Yes" : "No"}</span>
                </td>
                <td>
                  <span className="badge">{p.phase}</span>
                </td>
                <td>
                  <span className="badge">{p.active ? "Active" : "Inactive"}</span>
                </td>
                <td className="text-sm">
                  {p.assignments.length === 0
                    ? "—"
                    : p.assignments.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-2 mb-1">
                          <span>
                            {a.resource.employeeId ? a.resource.employeeId + " " : ""}
                            {a.resource.name} ({a.capacityPct}%,{" "}
                            {a.billable ? `${a.hourlyRate}/hr` : "non-billable"})
                          </span>
                          {canEdit ? (
                            <form action={unassignResource}>
                              <input type="hidden" name="projectId" value={p.id} />
                              <input type="hidden" name="resourceId" value={a.resourceId} />
                              <button className="text-xs text-rose-300 hover:underline" type="submit">
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ))}
                </td>
                {canEdit ? (
                  <td className="align-top">
                    <details className="text-sm">
                      <summary className="cursor-pointer text-sky-300">Edit / deactivate</summary>
                      <form action={updateProject} className="mt-2 grid gap-2 min-w-[220px]">
                        <input type="hidden" name="projectId" value={p.id} />
                        <input className="input" name="name" defaultValue={p.name} required />
                        <select className="input" name="phase" defaultValue={p.phase}>
                          {PHASES.map((ph) => (
                            <option key={ph} value={ph}>
                              {ph}
                            </option>
                          ))}
                        </select>
                        <select className="input" name="billable" defaultValue={p.billable ? "yes" : "no"}>
                          <option value="yes">Billable</option>
                          <option value="no">Non-billable</option>
                        </select>
                        <select className="input" name="active" defaultValue={p.active ? "yes" : "no"}>
                          <option value="yes">Active</option>
                          <option value="no">Inactive</option>
                        </select>
                        <input
                          className="input"
                          type="date"
                          name="startDate"
                          defaultValue={p.startDate?.toISOString().slice(0, 10) ?? ""}
                        />
                        <input
                          className="input"
                          type="date"
                          name="endDate"
                          defaultValue={p.endDate?.toISOString().slice(0, 10) ?? ""}
                        />
                        <button className="btn text-sm" type="submit">
                          Save
                        </button>
                      </form>
                      {p.active ? (
                        <form action={deleteProject} className="mt-2">
                          <input type="hidden" name="projectId" value={p.id} />
                          <button className="btn btn-secondary text-sm" type="submit">
                            Deactivate
                          </button>
                        </form>
                      ) : null}
                    </details>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
