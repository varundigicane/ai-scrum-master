import { createResource, updateResource, deleteResource } from "@/app/actions";
import { requireFeature } from "@/lib/require-feature";
import { hasFeature } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ResourcesPage() {
  const session = await requireFeature("resources");
  const canEdit = await hasFeature(session.user.companyId, session.user.role, "edit_delivery");
  const resources = await prisma.resource.findMany({
    where: { companyId: session.user.companyId },
    include: {
      assignments: {
        where: { active: true },
        include: { project: { include: { account: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Resources</h2>
        <p className="text-sm text-[var(--muted)]">
          Employee ID + multi-project assignments (set billing rate when assigning on Projects).
        </p>
      </div>

      {canEdit ? (
        <form action={createResource} className="panel p-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Employee ID</label>
            <input className="input" name="employeeId" placeholder="EMP001" />
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" name="name" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" type="email" required />
          </div>
          <div className="flex items-end">
            <button className="btn" type="submit">
              Add resource
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Projects (multi)</th>
              <th>Status</th>
              {canEdit ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id}>
                {canEdit ? (
                  <td colSpan={6} className="!p-0">
                    <div className="grid grid-cols-[1fr_1.2fr_1.4fr_1.4fr_0.7fr_auto] gap-2 items-center p-2">
                      <form action={updateResource} className="contents">
                        <input type="hidden" name="resourceId" value={r.id} />
                        <input
                          className="input"
                          name="employeeId"
                          defaultValue={r.employeeId ?? ""}
                          placeholder="EMP ID"
                        />
                        <input className="input" name="name" defaultValue={r.name} required />
                        <input
                          className="input"
                          name="email"
                          type="email"
                          defaultValue={r.email}
                          required
                        />
                        <div className="text-sm px-1">
                          {r.assignments.length === 0
                            ? "—"
                            : r.assignments.map((a) => (
                                <div key={a.id}>
                                  {a.project.account.name}/{a.project.name}
                                  {a.billable
                                    ? a.hourlyRate > 0
                                      ? ` @ ${a.hourlyRate}/hr`
                                      : " (billable)"
                                    : " (non-billable)"}
                                </div>
                              ))}
                        </div>
                        <select className="input" name="active" defaultValue={r.active ? "yes" : "no"}>
                          <option value="yes">Active</option>
                          <option value="no">Inactive</option>
                        </select>
                        <button className="btn btn-secondary text-sm" type="submit">
                          Save
                        </button>
                      </form>
                      {r.active ? (
                        <form action={deleteResource}>
                          <input type="hidden" name="resourceId" value={r.id} />
                          <button className="btn btn-secondary text-sm" type="submit">
                            Deactivate
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                ) : (
                  <>
                    <td>{r.employeeId ?? "—"}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td className="text-sm">
                      {r.assignments.map((a) => `${a.project.account.name}/${a.project.name}`).join("; ") ||
                        "—"}
                    </td>
                    <td>{r.active ? "Active" : "Inactive"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
