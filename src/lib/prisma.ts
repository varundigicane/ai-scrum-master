import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
  prismaSchemaVersion?: string;
};

/** Bump when models are added so HMR does not keep a stale PrismaClient singleton. */
const PRISMA_SCHEMA_VERSION = "work-item-display-id-v1";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required (PostgreSQL connection string)");
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      // Railway / managed Postgres need SSL; local Docker Postgres does not.
      // Set PGSSLMODE=disable for local compose; PGSSLMODE=require forces SSL.
      ssl:
        process.env.PGSSLMODE === "disable"
          ? undefined
          : process.env.NODE_ENV === "production" || process.env.PGSSLMODE === "require"
            ? { rejectUnauthorized: false }
            : undefined,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function isClientCurrent(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) return false;
  if (globalForPrisma.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION) return false;
  const c = client as PrismaClient & {
    billingMonthOverride?: { findUnique?: unknown };
    roleFeature?: { findMany?: unknown };
    reviewSheet?: { findMany?: unknown };
    gtsMonthlyReport?: { findUnique?: unknown };
  };
  return (
    typeof c.billingMonthOverride?.findUnique === "function" &&
    typeof c.roleFeature?.findMany === "function" &&
    typeof c.reviewSheet?.findMany === "function" &&
    typeof c.gtsMonthlyReport?.findUnique === "function"
  );
}

export const prisma: PrismaClient = isClientCurrent(globalForPrisma.prisma)
  ? globalForPrisma.prisma
  : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}
