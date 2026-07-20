import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { getEnabledFeatures } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const enabled = await getEnabledFeatures(session.user.companyId, role);
  const visible = FEATURE_CATALOG.filter(
    (f) => f.kind === "menu" && f.href && enabled.has(f.key),
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-[var(--border)] bg-[#0c1218]/80 backdrop-blur p-4">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.14em] text-teal-300/80">AI Scrum Master</p>
          <h1 className="text-lg font-semibold mt-1">Delivery HQ</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {session.user.name} · {ROLE_LABELS[role] ?? role}
          </p>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          {visible.map((l) => (
            <Link
              key={l.key}
              href={l.href!}
              className="px-3 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-white whitespace-nowrap"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="btn-secondary btn w-full text-sm" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}
