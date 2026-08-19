import { NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/enums";
import { getBearerToken, verifyMobileToken, type MobileTokenPayload } from "@/lib/mobile-auth";
import { hasFeature } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/roles";
import { toFriendlyError } from "@/lib/friendly-error";

export async function requireMobileFeature(
  req: Request,
  feature: FeatureKey,
): Promise<MobileTokenPayload> {
  const token = getBearerToken(req);
  if (!token) throw new Error("Sign in required.");
  const payload = await verifyMobileToken(token);
  const ok = await hasFeature(payload.companyId, payload.role as Role, feature);
  if (!ok) {
    throw new Error("You do not have permission to do that. Ask a Company Admin to update Feature access.");
  }
  return payload;
}

export function mobileErrorResponse(error: unknown) {
  const msg = toFriendlyError(error);
  const status = msg.includes("Sign in") ? 401 : msg.includes("permission") ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}
