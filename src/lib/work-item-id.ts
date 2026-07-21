import type { PrismaClient } from "@/generated/prisma/client";

/** First 4 letters of project name (A–Z), uppercased. */
export function projectPrefix(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (!letters) return "PROJ";
  return letters.slice(0, 4);
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/**
 * Atomically bump Project.workItemSeq and return `{PREFIX}-{n}`.
 * Must be called inside `prisma.$transaction(...)`.
 */
export async function allocateDisplayId(tx: Tx, projectId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ name: string; workItemSeq: number }>>`
    UPDATE "Project"
    SET "workItemSeq" = "workItemSeq" + 1
    WHERE "id" = ${projectId}
    RETURNING "name", "workItemSeq"
  `;
  const row = rows[0];
  if (!row) throw new Error("Project not found");
  return `${projectPrefix(row.name)}-${row.workItemSeq}`;
}

/** Label for lists: `ACME-1 · Title` */
export function workItemLabel(displayId: string | null | undefined, title: string): string {
  return displayId ? `${displayId} · ${title}` : title;
}
