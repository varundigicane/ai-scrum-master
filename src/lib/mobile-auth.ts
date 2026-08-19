import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

export type MobileTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Server auth secret is not configured.");
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(payload: MobileTokenPayload) {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
    companyId: payload.companyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyMobileToken(token: string): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (!payload.sub || !payload.companyId || !payload.role) {
    throw new Error("Invalid mobile session.");
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    role: payload.role as Role,
    companyId: String(payload.companyId),
  };
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}
