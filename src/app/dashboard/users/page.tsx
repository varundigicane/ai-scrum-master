import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUser, updateUserRole } from "@/app/actions";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/roles";
import { hasFeature } from "@/lib/permissions";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await hasFeature(session.user.companyId, session.user.role, "users"))) {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where: { companyId: session.user.companyId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const canManage = await hasFeature(session.user.companyId, session.user.role, "manage_users");
  const canPermissions = await hasFeature(session.user.companyId, session.user.role, "permissions");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Users &amp; roles</h2>
        <p className="text-sm text-[var(--muted)]">
          Assign different roles to different people. Then use{" "}
          {canPermissions ? (
            <a className="text-sky-300 hover:underline" href="/dashboard/permissions">
              Feature access
            </a>
          ) : (
            "Feature access"
          )}{" "}
          to show/hide menus and actions per role.
        </p>
      </div>

      <div className="panel p-4 text-sm text-[var(--muted)] space-y-1">
        <p>
          <strong className="text-white">CEO / SVP</strong> — company &amp; account visibility, digests, user admin (SVP)
        </p>
        <p>
          <strong className="text-white">VP / AVP / Project Manager</strong> — projects, billing, status alerts, leaves
        </p>
        <p>
          <strong className="text-white">Employee</strong> — daily status via email link; limited dashboard
        </p>
        <p>
          <strong className="text-white">Company Admin</strong> — full system + settings
        </p>
      </div>

      {canManage ? (
      <form action={createUser} className="panel p-4 grid gap-3 md:grid-cols-5">
        <div>
          <label className="label">Name</label>
          <input className="input" name="name" required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" name="password" type="password" minLength={6} required />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" name="role" defaultValue="Employee">
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn" type="submit">
            Add user
          </button>
        </div>
      </form>
      ) : (
        <p className="text-sm text-[var(--muted)]">You can view users but not change roles.</p>
      )}

      <div className="panel overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th>Change role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className="badge">{ROLE_LABELS[u.role] ?? u.role}</span>
                </td>
                <td>{u.active ? "Yes" : "No"}</td>
                <td>
                  {canManage ? (
                  <form action={updateUserRole} className="flex gap-2 items-center">
                    <input type="hidden" name="userId" value={u.id} />
                    <select className="input" name="role" defaultValue={u.role}>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-secondary text-sm" type="submit">
                      Save
                    </button>
                  </form>
                  ) : (
                    <span className="badge">{ROLE_LABELS[u.role] ?? u.role}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
