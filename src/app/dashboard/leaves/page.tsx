import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createExtraWorkingDay, createLeave } from "@/app/actions";

export default async function LeavesPage() {
  const session = await auth();
  const companyId = session!.user.companyId;
  const [resources, projects, leaves, extras] = await Promise.all([
    prisma.resource.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      where: { account: { companyId }, active: true },
      include: { account: true },
      orderBy: { name: "asc" },
    }),
    prisma.leave.findMany({
      where: { resource: { companyId } },
      include: { resource: true, project: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.extraWorkingDay.findMany({
      where: { resource: { companyId } },
      include: { resource: true, project: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Leaves &amp; extra working days</h2>
        <p className="text-sm text-[var(--muted)]">
          Internal / client-informed leaves reduce billable days. Extra working days increase billable days.
          Formula: billable days = working days − leaves + extras.
        </p>
      </div>

      <form action={createLeave} className="panel p-4 grid gap-3 md:grid-cols-3">
        <h3 className="md:col-span-3 font-semibold">Add leave</h3>
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
          <label className="label">Project (optional — blank = all projects)</label>
          <select className="input" name="projectId" defaultValue="">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.account.name} / {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="type" defaultValue="internal">
            <option value="internal">Internal</option>
            <option value="client_informed">Client informed</option>
          </select>
        </div>
        <div>
          <label className="label">Start</label>
          <input className="input" type="date" name="startDate" required />
        </div>
        <div>
          <label className="label">End</label>
          <input className="input" type="date" name="endDate" required />
        </div>
        <div>
          <label className="label">Reason</label>
          <input className="input" name="reason" />
        </div>
        <div className="md:col-span-3">
          <button className="btn" type="submit">
            Log leave
          </button>
        </div>
      </form>

      <form action={createExtraWorkingDay} className="panel p-4 grid gap-3 md:grid-cols-4">
        <h3 className="md:col-span-4 font-semibold">Add extra working day</h3>
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
          <label className="label">Project</label>
          <select className="input" name="projectId" required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.account.name} / {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" name="date" required />
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" name="note" placeholder="Weekend release support" />
        </div>
        <div className="md:col-span-4">
          <button className="btn btn-secondary" type="submit">
            Add extra day
          </button>
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <h3 className="font-semibold p-4 pb-0">Leaves</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Project</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.resource.employeeId ? `${l.resource.employeeId} — ` : ""}
                  {l.resource.name}
                </td>
                <td>
                  <span className="badge">{l.type}</span>
                </td>
                <td>
                  {l.startDate.toISOString().slice(0, 10)} → {l.endDate.toISOString().slice(0, 10)}
                </td>
                <td>{l.project?.name ?? "All projects"}</td>
                <td>{l.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel overflow-x-auto">
        <h3 className="font-semibold p-4 pb-0">Extra working days</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Project</th>
              <th>Date</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {extras.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.resource.employeeId ? `${e.resource.employeeId} — ` : ""}
                  {e.resource.name}
                </td>
                <td>{e.project.name}</td>
                <td>{e.date.toISOString().slice(0, 10)}</td>
                <td>{e.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
