import { auth } from "@/lib/auth";
import { hasFeature } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/roles";

/** Require logged-in session; return session. */
export async function assertSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

/** Require a feature flag for the current user's role. */
export async function assertFeature(feature: FeatureKey) {
  const session = await assertSession();
  const ok = await hasFeature(session.user.companyId, session.user.role, feature);
  if (!ok) throw new Error(`Unauthorized — missing feature: ${feature}`);
  return session;
}

/** Mutate accounts, projects, resources, leaves, SDLC backlog. */
export async function assertDeliveryEdit() {
  return assertFeature("edit_delivery");
}
