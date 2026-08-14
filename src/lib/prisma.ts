import { PrismaClient } from "@/generated/prisma/client";
import { getPrismaAdapter } from "@/lib/db-adapter";

// DATABASE_URL is the *pooled* Neon connection string in production (or a
// local Postgres URL during development). Local hosts use the classic pg
// driver; Neon hosts use the serverless driver.
const adapter = getPrismaAdapter(process.env.DATABASE_URL!);

// Singleton so serverless functions reuse the same client across warm
// invocations instead of exhausting database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
