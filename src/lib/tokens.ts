import { createHash, randomBytes } from "node:crypto";

export function createStatusToken(): { token: string; tokenHash: string; tokenHint: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const tokenHint = token.slice(0, 6);
  return { token, tokenHash, tokenHint };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appUrl(pathname = ""): string {
  const base = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
