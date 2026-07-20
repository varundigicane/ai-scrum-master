import { prisma } from "../src/lib/prisma";

async function main() {
  const resources = await prisma.resource.findMany({ orderBy: { createdAt: "asc" } });
  let i = 1;
  for (const r of resources) {
    if (!r.employeeId) {
      await prisma.resource.update({
        where: { id: r.id },
        data: { employeeId: `EMP${String(i).padStart(3, "0")}` },
      });
    }
    i += 1;
  }

  const assigns = await prisma.resourceAssignment.findMany();
  for (const a of assigns) {
    if (!a.hourlyRate || a.hourlyRate === 0) {
      await prisma.resourceAssignment.update({
        where: { id: a.id },
        data: { hourlyRate: 50 },
      });
    }
  }

  const start = new Date("2026-01-01");
  const end = new Date("2026-12-31");
  const projects = await prisma.project.findMany();
  for (const p of projects) {
    await prisma.project.update({
      where: { id: p.id },
      data: {
        billable: true,
        startDate: p.startDate ?? start,
        endDate: p.endDate ?? end,
      },
    });
  }

  console.log("Backfill complete", {
    resources: resources.length,
    assignments: assigns.length,
    projects: projects.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
