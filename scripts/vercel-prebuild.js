#!/usr/bin/env node
// Loads .env for local runs; on Vercel the variables come from the project
// environment (dotenv never overrides existing env vars, and there is no
// .env file in the deployment anyway).
require("dotenv").config();

// Preflight checks for Vercel production builds.
//
// `vercel-build` runs `prisma migrate deploy`, which needs DIRECT_URL (the
// direct, non-pooled Neon connection string — migrations can't run through
// the pooled endpoint). `next build` can also touch the database at build
// time, so DATABASE_URL is required too. Fails fast with a readable
// checklist instead of a cryptic Prisma error.
const required = ["DIRECT_URL", "DATABASE_URL"];
const missing = required.filter((name) => !process.env[name]);

const warnings = [];
if (!process.env.ENCRYPTION_KEY) warnings.push("ENCRYPTION_KEY");
if (!process.env.AUTH_SECRET) warnings.push("AUTH_SECRET");
if (!process.env.CRON_SECRET) warnings.push("CRON_SECRET");
if (!process.env.ADMIN_EMAIL) warnings.push("ADMIN_EMAIL");

if (missing.length > 0) {
  console.error(
    `\n\u274c vercel-build: missing required environment variables: ${missing.join(", ")}`,
  );
  console.error(
    "   Add them in Vercel \u2192 Project \u2192 Settings \u2192 Environment Variables (Production).",
  );
  console.error(
    "   - DIRECT_URL   = your Neon connection string WITHOUT -pooler (used by prisma migrate deploy)",
  );
  console.error(
    "   - DATABASE_URL = your Neon connection string WITH -pooler (used by the app)",
  );
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(
    `\n\u26a0\ufe0f  Not configured yet (build continues, but these are needed at runtime): ${warnings.join(", ")}`,
  );
  console.warn("   ENCRYPTION_KEY and AUTH_SECRET must match your local .env exactly.");
}
console.log("\u2705 vercel prebuild checks passed.");
