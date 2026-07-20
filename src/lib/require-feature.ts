import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/roles";

/** Guard a dashboard page by feature flag for the current user's role. */
export async function requireFeature(feature: FeatureKey) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ok = await hasFeature(session.user.companyId, session.user.role, feature);
  if (!ok) redirect("/dashboard");
  return session;
}
