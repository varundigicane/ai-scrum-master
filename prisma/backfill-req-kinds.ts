import { prisma } from "../src/lib/prisma";

async function main() {
  const reqs = await prisma.requirement.findMany();
  for (const r of reqs) {
    const kind = r.level <= 1 ? "epic" : r.level === 2 ? "feature" : "story";
    if (r.kind !== kind) {
      await prisma.requirement.update({ where: { id: r.id }, data: { kind } });
    }
  }
  console.log(`Backfilled kind on ${reqs.length} requirements`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
