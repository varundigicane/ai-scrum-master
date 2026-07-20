import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("No company");
  const passwordHash = await bcrypt.hash("password123", 10);

  const extras = [
    { email: "ceo@acme.local", name: "CEO User", role: "CEO" as const },
    { email: "vp@acme.local", name: "VP Accounts", role: "VP" as const },
    { email: "avp@acme.local", name: "AVP Delivery", role: "AVP" as const },
  ];

  for (const u of extras) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: u.role, name: u.name } });
      console.log("updated", u.email);
    } else {
      await prisma.user.create({
        data: {
          companyId: company.id,
          email: u.email,
          name: u.name,
          passwordHash,
          role: u.role,
        },
      });
      console.log("created", u.email);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
