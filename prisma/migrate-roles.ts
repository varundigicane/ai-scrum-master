import { prisma } from "../src/lib/prisma";
import { migrateLegacyRole } from "../src/lib/roles";

async function main() {
  const users = await prisma.user.findMany();
  let updated = 0;
  for (const u of users) {
    const next = migrateLegacyRole(u.role as string);
    if (next !== u.role) {
      await prisma.user.update({ where: { id: u.id }, data: { role: next } });
      updated += 1;
      console.log(`${u.email}: ${u.role} → ${next}`);
    }
  }
  // Ensure default column for new users conceptually already Employee
  console.log(`Role migration done. Updated ${updated}/${users.length} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
