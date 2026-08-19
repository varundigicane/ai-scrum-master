import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth, signOut } from "@/lib/auth";
import { FEATURE_CATALOG, ROLE_LABELS } from "@/lib/roles";
import { getEnabledFeatures } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const enabled = await getEnabledFeatures(session.user.companyId, role);
  const visible = FEATURE_CATALOG.filter(
    (f) => f.kind === "menu" && f.href && enabled.has(f.key),
  ).map((f) => ({ key: f.key, label: f.label, href: f.href! }));

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <DashboardShell
      brand="AI Scrum Master"
      userLine={`${session.user.name} · ${ROLE_LABELS[role] ?? role}`}
      nav={visible}
      signOutAction={signOutAction}
    >
      {children}
    </DashboardShell>
  );
}
