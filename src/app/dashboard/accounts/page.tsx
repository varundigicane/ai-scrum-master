import { createAccount, updateAccount, deleteAccount } from "@/app/actions";
import { requireFeature } from "@/lib/require-feature";
import { hasFeature } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage() {
  const session = await requireFeature("accounts");
  const canEdit = await hasFeature(session.user.companyId, session.user.role, "edit_delivery");
  const accounts = await prisma.account.findMany({
    where: { companyId: session.user.companyId },
    include: { projects: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Accounts (clients)</h2>
        <p className="text-sm text-[var(--muted)]">
          Multiple projects under each client/account. Company Admin can add, update, and deactivate.
        </p>
      </div>

      {canEdit ? (
        <form action={createAccount} className="panel p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Account name</label>
            <input className="input" name="name" required placeholder="Contoso Bank" />
          </div>
          <div>
            <label className="label">Code (GTS project name)</label>
            <input className="input" name="code" placeholder="CIBC-FOB" />
          </div>
          <div>
            <label className="label">Technology</label>
            <input className="input" name="technology" placeholder="JAVA, .NET, React JS" />
          </div>
          <div>
            <label className="label">Domain</label>
            <input className="input" name="domain" placeholder="Banking & Finance" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Project managers</label>
            <input className="input" name="projectManagers" placeholder="Varun Srivastava, Manoj Kumar" />
          </div>
          <div className="flex items-end">
            <button className="btn" type="submit">
              Add account
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Projects</th>
              <th>Status</th>
              {canEdit ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) =>
              canEdit ? (
                <tr key={a.id}>
                  <td colSpan={5}>
                    <form action={updateAccount} className="flex flex-wrap gap-2 items-end">
                      <input type="hidden" name="accountId" value={a.id} />
                      <div className="min-w-[140px] flex-1">
                        <label className="label">Name</label>
                        <input className="input" name="name" defaultValue={a.name} required />
                      </div>
                      <div className="min-w-[90px]">
                        <label className="label">Code</label>
                        <input className="input" name="code" defaultValue={a.code ?? ""} />
                      </div>
                      <div className="min-w-[140px] flex-1">
                        <label className="label">Technology</label>
                        <input className="input" name="technology" defaultValue={a.technology ?? ""} />
                      </div>
                      <div className="min-w-[120px]">
                        <label className="label">Domain</label>
                        <input className="input" name="domain" defaultValue={a.domain ?? ""} />
                      </div>
                      <div className="min-w-[160px] flex-1">
                        <label className="label">PMs</label>
                        <input
                          className="input"
                          name="projectManagers"
                          defaultValue={a.projectManagers ?? ""}
                        />
                      </div>
                      <div>
                        <label className="label">Projects</label>
                        <p className="text-sm py-2">{a.projects.length}</p>
                      </div>
                      <div>
                        <label className="label">Status</label>
                        <select className="input" name="active" defaultValue={a.active ? "yes" : "no"}>
                          <option value="yes">Active</option>
                          <option value="no">Inactive</option>
                        </select>
                      </div>
                      <button className="btn btn-secondary text-sm" type="submit">
                        Save
                      </button>
                    </form>
                    {a.active ? (
                      <form action={deleteAccount} className="mt-2">
                        <input type="hidden" name="accountId" value={a.id} />
                        <button className="btn btn-secondary text-sm" type="submit">
                          Deactivate
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ) : (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.code ?? "—"}</td>
                  <td>{a.projects.length}</td>
                  <td>{a.active ? "Active" : "Inactive"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
