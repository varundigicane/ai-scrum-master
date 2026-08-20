import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

/** First 4 letters of company name (A–Z), uppercased. */
export function meetingNotePrefixFromName(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (!letters) return "NOTE";
  return letters.slice(0, 4);
}

/**
 * Atomically bump Company.meetingNoteSeq and return `{PREFIX}-{n}` (e.g. ACME-1).
 * Must run inside prisma.$transaction.
 */
export async function allocateMeetingNoteFunctionalId(tx: Tx, companyId: string): Promise<string> {
  const rows = await tx.$queryRaw<
    Array<{ name: string; meetingNoteIdPrefix: string | null; meetingNoteSeq: number }>
  >`
    UPDATE "Company"
    SET "meetingNoteSeq" = "meetingNoteSeq" + 1
    WHERE "id" = ${companyId}
    RETURNING "name", "meetingNoteIdPrefix", "meetingNoteSeq"
  `;
  const row = rows[0];
  if (!row) throw new Error("Company not found");
  const prefix = (row.meetingNoteIdPrefix?.trim() || meetingNotePrefixFromName(row.name)).toUpperCase();
  return `${prefix}-${row.meetingNoteSeq}`;
}
