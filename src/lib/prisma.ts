import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Prisma 7 + Neon serverless driver adapter. DATABASE_URL is the *pooled*
// connection string from Neon, ideal for serverless functions.
const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});

// Singleton so serverless functions reuse the same client across warm
// invocations instead of exhausting database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
