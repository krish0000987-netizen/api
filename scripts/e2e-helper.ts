// Test helper: performs the same DB operations the production server actions
// perform, so the E2E script can drive the data layer from the shell.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { getPrismaAdapter } from "../src/lib/db-adapter";
import { generateApiKey } from "../src/lib/api-keys";
import { encryptSecret, fingerprint } from "../src/lib/crypto";

const prisma = new PrismaClient({ adapter: getPrismaAdapter(process.env.DATABASE_URL!) });

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case "create-customer": {
      const [email, password] = args;
      const { apiKey, hash, lookup, masked } = await generateApiKey("sandbox");
      const customer = await prisma.customer.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password, 10),
          apiKeyHash: hash,
          apiKeyLookup: lookup,
          apiKeyPrefix: masked,
          mode: "sandbox",
          plan: "free",
        },
        select: { id: true },
      });
      console.log(`CUSTOMER_ID=${customer.id}`);
      console.log(`CUSTOMER_KEY=${apiKey}`);
      break;
    }
    case "set-mode": {
      const [id, mode] = args;
      await prisma.customer.update({ where: { id }, data: { mode } });
      console.log(`mode=${mode}`);
      break;
    }
    case "enable-integration": {
      const [customerId, vendorId] = args;
      const position = await prisma.customerIntegration.count({ where: { customerId } });
      const row = await prisma.customerIntegration.create({
        data: { customerId, vendorId, position },
        select: { id: true },
      });
      console.log(`INTEGRATION_ID=${row.id}`);
      break;
    }
    case "disable-integration": {
      const [customerId, vendorId] = args;
      await prisma.customerIntegration.deleteMany({ where: { customerId, vendorId } });
      console.log("disabled");
      break;
    }
    case "reorder-integrations": {
      const [customerId, idsCsv] = args;
      const ids = idsCsv.split(",");
      await prisma.$transaction(
        ids.map((id, index) =>
          prisma.customerIntegration.updateMany({ where: { id, customerId }, data: { position: index } }),
        ),
      );
      console.log("reordered");
      break;
    }
    case "reorder-vendors": {
      const [idsCsv] = args;
      const ids = idsCsv.split(",");
      await prisma.$transaction(
        ids.map((id, index) => prisma.vendor.updateMany({ where: { id }, data: { priority: index } })),
      );
      console.log("reordered");
      break;
    }
    case "revoke": {
      const [id] = args;
      await prisma.customer.update({ where: { id }, data: { apiKeyRevoked: true } });
      console.log("revoked");
      break;
    }
    case "regenerate": {
      const [id] = args;
      const customer = await prisma.customer.findUnique({ where: { id }, select: { mode: true } });
      const mode = customer?.mode === "live" ? "live" : "sandbox";
      const { apiKey, hash, lookup, masked } = await generateApiKey(mode);
      await prisma.customer.update({
        where: { id },
        data: { apiKeyHash: hash, apiKeyLookup: lookup, apiKeyPrefix: masked, apiKeyRevoked: false },
      });
      console.log(`CUSTOMER_KEY=${apiKey}`);
      break;
    }
    case "upsert-vendor": {
      // slug name sandboxEndpoint sandboxKey liveEndpoint liveKey [priority]
      const [slug, name, sandboxEndpoint, sandboxKey, liveEndpoint, liveKey, priority = "0"] = args;
      const existing = await prisma.vendor.findUnique({ where: { slug } });
      const data = {
        name,
        sandboxEndpoint,
        sandboxKeyEnc: encryptSecret(sandboxKey),
        sandboxKeyFingerprint: fingerprint(sandboxKey),
        liveEndpoint,
        liveKeyEnc: encryptSecret(liveKey),
        liveKeyFingerprint: fingerprint(liveKey),
        priority: Number(priority),
        enabled: true,
      };
      if (existing) {
        await prisma.vendor.update({ where: { slug }, data });
      } else {
        await prisma.vendor.create({ data: { slug, ...data } });
      }
      console.log(`VENDOR_${slug.toUpperCase()}_ID=${existing?.id ?? ""}`);
      break;
    }
    case "set-customer-layout": {
      const [id, layout] = args;
      await prisma.customer.update({ where: { id }, data: { dashboardLayout: layout } });
      console.log("layout saved");
      break;
    }
    default:
      console.error("unknown command");
      process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
