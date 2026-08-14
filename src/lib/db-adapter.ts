import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

// Prisma 7 requires a driver adapter. The Neon serverless driver uses the
// Neon WebSocket protocol, which only works against Neon (or Neon-compatible
// proxies) — so for local development against a regular Postgres (Docker,
// Homebrew, etc.) we fall back to the classic pg driver. Production stays on
// Neon, which is what Vercel deploys expect.
export function getPrismaAdapter(connectionString: string): PrismaNeon | PrismaPg {
  const isLocal =
    process.env.PRISMA_DRIVER === "pg" ||
    /localhost|127\.0\.0\.1|::1/.test(connectionString);
  if (isLocal) {
    return new PrismaPg({ connectionString });
  }
  return new PrismaNeon({ connectionString });
}
