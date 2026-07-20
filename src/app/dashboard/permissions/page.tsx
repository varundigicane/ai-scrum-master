import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { saveRoleFeatureMatrix } from "@/app/actions";
import { FEATURE_CATALOG, ROLE_LABELS, ALL_ROLES } from "@/lib/roles";
import { getRoleFeatureMatrix, hasFeature } from "@/lib/permissions";

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allowed = await hasFeature(session.user.companyId, session.user.role, "permissions");
  if (!allowed) redirect("/dashboard");

  const matrix = await getRoleFeatureMatrix(session.user.companyId);
  const menuFeatures = FEATURE_CATALOG.filter((f) => f.kind === "menu");
  const actionFeatures = FEATURE_CATALOG.filter((f) => f.kind === "action");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Feature access by role</h2>
        <p className="text-sm text-[var(--muted)]">
          Assign roles on <strong>Users &amp; roles</strong>, then show/hide menus and actions here.
          Changes apply on next page load (users should refresh / re-login).{" "}
          <strong>Company Admin</strong> always has full access and cannot be locked out.
        </p>
      </div>

      <form action={saveRoleFeatureMatrix} className="space-y-6">
        <section className="panel overflow-x-auto p-4">
          <h3 className="font-semibold mb-3">Menus (show / hide)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Feature</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="text-center text-xs">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menuFeatures.map((f) => (
                <tr key={f.key}>
                  <td>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-[var(--muted)]">{f.description}</div>
                  </td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className="text-center">
                      <input
                        type="checkbox"
                        name={`perm__${role}__${f.key}`}
                        defaultChecked={role === "CompanyAdmin" ? true : Boolean(matrix[role]?.[f.key])}
                        disabled={role === "CompanyAdmin"}
                        className="h-4 w-4 accent-teal-400 disabled:opacity-60"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel overflow-x-auto p-4">
          <h3 className="font-semibold mb-3">Actions (allow / deny)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="text-center text-xs">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actionFeatures.map((f) => (
                <tr key={f.key}>
                  <td>
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-[var(--muted)]">{f.description}</div>
                  </td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} className="text-center">
                      <input
                        type="checkbox"
                        name={`perm__${role}__${f.key}`}
                        defaultChecked={role === "CompanyAdmin" ? true : Boolean(matrix[role]?.[f.key])}
                        disabled={role === "CompanyAdmin"}
                        className="h-4 w-4 accent-teal-400 disabled:opacity-60"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <button className="btn" type="submit">
          Save feature access
        </button>
      </form>
    </div>
  );
}
