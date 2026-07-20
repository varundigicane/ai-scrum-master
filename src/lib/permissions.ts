import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  ALL_ROLES,
  DEFAULT_FEATURE_MATRIX,
  FEATURE_CATALOG,
  type FeatureKey,
  ROLE_LABELS,
} from "@/lib/roles";

export { FEATURE_CATALOG, ROLE_LABELS, ALL_ROLES, type FeatureKey };

/** Resolve enabled features for a role (DB overrides + defaults). */
export async function getEnabledFeatures(
  companyId: string,
  role: Role,
): Promise<Set<FeatureKey>> {
  // Company Admin always retains full access (cannot be locked out via matrix).
  if (role === "CompanyAdmin") {
    return new Set(FEATURE_CATALOG.map((f) => f.key));
  }

  await ensureDefaultRoleFeatures(companyId);

  const rows = await prisma.roleFeature.findMany({
    where: { companyId, role },
  });

  const enabled = new Set<FeatureKey>();
  const defaults = DEFAULT_FEATURE_MATRIX[role] ?? [];

  if (rows.length === 0) {
    for (const f of defaults) enabled.add(f);
    return enabled;
  }

  const byFeature = new Map(rows.map((r) => [r.feature as FeatureKey, r.enabled]));
  for (const feature of FEATURE_CATALOG) {
    const key = feature.key;
    if (byFeature.has(key)) {
      if (byFeature.get(key)) enabled.add(key);
    } else if (defaults.includes(key)) {
      enabled.add(key);
    }
  }
  return enabled;
}

export async function hasFeature(
  companyId: string,
  role: Role,
  feature: FeatureKey,
): Promise<boolean> {
  const set = await getEnabledFeatures(companyId, role);
  return set.has(feature);
}

/** Seed missing role×feature rows from defaults (additive, no wipe). */
export async function ensureDefaultRoleFeatures(companyId: string) {
  const existing = await prisma.roleFeature.findMany({
    where: { companyId },
    select: { role: true, feature: true },
  });
  const have = new Set(existing.map((e) => `${e.role}::${e.feature}`));

  const data = [];
  for (const role of ALL_ROLES) {
    const defaults = new Set(DEFAULT_FEATURE_MATRIX[role] ?? []);
    for (const feature of FEATURE_CATALOG) {
      const key = `${role}::${feature.key}`;
      if (have.has(key)) continue;
      data.push({
        companyId,
        role,
        feature: feature.key,
        enabled: defaults.has(feature.key),
      });
    }
  }
  if (data.length) {
    await prisma.roleFeature.createMany({ data });
  }
}

export async function getRoleFeatureMatrix(companyId: string) {
  await ensureDefaultRoleFeatures(companyId);
  const rows = await prisma.roleFeature.findMany({ where: { companyId } });
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const role of ALL_ROLES) {
    matrix[role] = {};
    for (const f of FEATURE_CATALOG) {
      matrix[role][f.key] = (DEFAULT_FEATURE_MATRIX[role] ?? []).includes(f.key);
    }
  }
  for (const row of rows) {
    if (!matrix[row.role]) matrix[row.role] = {};
    matrix[row.role][row.feature] = row.enabled;
  }
  return matrix;
}

export async function setRoleFeature(
  companyId: string,
  role: Role,
  feature: FeatureKey,
  enabled: boolean,
) {
  await prisma.roleFeature.upsert({
    where: {
      companyId_role_feature: { companyId, role, feature },
    },
    create: { companyId, role, feature, enabled },
    update: { enabled },
  });
}
