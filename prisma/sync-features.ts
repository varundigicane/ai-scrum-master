import { prisma } from "../src/lib/prisma";
import { ALL_ROLES, DEFAULT_FEATURE_MATRIX, FEATURE_CATALOG } from "../src/lib/roles";

/** Ensure every role×feature row exists; enable defaults for newly added features. */
async function main() {
  const companies = await prisma.company.findMany();
  for (const company of companies) {
    for (const role of ALL_ROLES) {
      const defaults = new Set(DEFAULT_FEATURE_MATRIX[role] ?? []);
      for (const feature of FEATURE_CATALOG) {
        const existing = await prisma.roleFeature.findUnique({
          where: {
            companyId_role_feature: {
              companyId: company.id,
              role,
              feature: feature.key,
            },
          },
        });
        if (!existing) {
          await prisma.roleFeature.create({
            data: {
              companyId: company.id,
              role,
              feature: feature.key,
              enabled: defaults.has(feature.key),
            },
          });
          console.log(`+ ${role}.${feature.key}=${defaults.has(feature.key)}`);
        } else if (defaults.has(feature.key) && !existing.enabled) {
          // Re-enable core delivery features if they were missing from early seeds
          if (
            ["edit_delivery", "workboard", "quality", "projects", "backlog"].includes(feature.key)
          ) {
            await prisma.roleFeature.update({
              where: { id: existing.id },
              data: { enabled: true },
            });
            console.log(`enable ${role}.${feature.key}`);
          }
        }
      }
    }
  }
  console.log("Feature sync done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
