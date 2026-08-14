// Demo seed: creates (or refreshes) a demo customer you can log into and a
// fresh API key you can paste into the landing-page playground. Idempotent —
// safe to re-run; it rotates the key each time.
//
// Usage: npm run seed:demo
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { getPrismaAdapter } from "../src/lib/db-adapter";
import { generateApiKey } from "../src/lib/api-keys";

const prisma = new PrismaClient({ adapter: getPrismaAdapter(process.env.DATABASE_URL!) });

const DEMO_EMAIL = "demo@demo.com";
const DEMO_PASSWORD = "demo123456";
// Vendors the demo customer has access to (must exist in the DB).
const DEMO_SLUGS = ["sms", "payments"];

async function main() {
  const { apiKey, hash, lookup, masked } = await generateApiKey("sandbox");

  const customer = await prisma.customer.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      apiKeyRevoked: false,
      mode: "sandbox",
      plan: "pro",
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      mode: "sandbox",
      plan: "pro",
    },
    select: { id: true },
  });

  // Ensure integrations exist for the demo vendors.
  const vendors = await prisma.vendor.findMany({
    where: { slug: { in: DEMO_SLUGS }, enabled: true },
    select: { id: true, slug: true },
  });
  const existing = await prisma.customerIntegration.findMany({
    where: { customerId: customer.id },
    select: { vendorId: true },
  });
  const existingIds = new Set(existing.map((e) => e.vendorId));
  let position = existing.length;
  for (const vendor of vendors) {
    if (!existingIds.has(vendor.id)) {
      await prisma.customerIntegration.create({
        data: { customerId: customer.id, vendorId: vendor.id, position: position++ },
      });
    }
  }

  // Write the demo key into .env so the playground can prefill it.
  const envPath = path.resolve(process.cwd(), ".env");
  let env = fs.readFileSync(envPath, "utf8");
  if (/^DEMO_API_KEY=/m.test(env)) {
    env = env.replace(/^DEMO_API_KEY=.*$/m, `DEMO_API_KEY="${apiKey}"`);
  } else {
    env += `\n# Demo-only key for the landing-page playground (never set in production)\nDEMO_API_KEY="${apiKey}"\n`;
  }
  fs.writeFileSync(envPath, env);

  console.log(`✅ Demo customer ready:`);
  console.log(`   email:    ${DEMO_EMAIL}`);
  console.log(`   password: ${DEMO_PASSWORD}`);
  console.log(`   API key:  ${apiKey}`);
  console.log(`   mode:     sandbox · plan: pro`);
  console.log(`   integrations: ${vendors.map((v) => v.slug).join(", ") || "(none — add vendors first)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
