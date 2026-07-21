/**
 * Assign displayId to existing Requirements and Tasks that lack one.
 * Run: npx tsx prisma/backfill-display-ids.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { projectPrefix } from "../src/lib/work-item-id";

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, workItemSeq: true } });

  for (const project of projects) {
    const prefix = projectPrefix(project.name);

    const reqRows = await prisma.requirement.findMany({
      where: { projectId: project.id, displayId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    });
    const taskRows = await prisma.task.findMany({
      where: { projectId: project.id, displayId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    });

    type Row = { id: string; createdAt: Date; type: "requirement" | "task" };
    const merged: Row[] = [
      ...reqRows.map((r) => ({ id: r.id, createdAt: r.createdAt, type: "requirement" as const })),
      ...taskRows.map((t) => ({ id: t.id, createdAt: t.createdAt, type: "task" as const })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let seq = project.workItemSeq;
    for (const row of merged) {
      seq += 1;
      const displayId = `${prefix}-${seq}`;
      if (row.type === "requirement") {
        await prisma.requirement.update({ where: { id: row.id }, data: { displayId } });
      } else {
        await prisma.task.update({ where: { id: row.id }, data: { displayId } });
      }
    }

    if (seq !== project.workItemSeq) {
      await prisma.project.update({ where: { id: project.id }, data: { workItemSeq: seq } });
    }

    console.log(`${project.name}: assigned ${merged.length} display ids (workItemSeq → ${seq})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
