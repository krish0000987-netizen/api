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
import { encryptSecret, fingerprint } from "../src/lib/crypto";
import { encryptAuthConfig } from "../src/lib/auth-config";
import { rupeesToPaise } from "../src/lib/pricing";

const prisma = new PrismaClient({ adapter: getPrismaAdapter(process.env.DATABASE_URL!) });

const DEMO_EMAIL = "demo@demo.com";
const DEMO_PASSWORD = "demo123456";
// Vendors the demo customer has access to (must exist in the DB).
const DEMO_SLUGS = ["sms", "payments"];

const MOCK_PORT = Number(process.env.MOCK_PORT ?? 9100);
const MOCK_SANDBOX = `http://localhost:${MOCK_PORT}/sandbox`;
const MOCK_LIVE = `http://localhost:${MOCK_PORT}/live`;

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
  const vendorSlugs = [...DEMO_SLUGS, "mock-verification"];
  const vendors = await prisma.vendor.findMany({
    where: { slug: { in: vendorSlugs }, enabled: true },
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

  // ---- Demo identity-verification provider + products (section 10/27) ----
  const mockVendor = await seedMockVerificationVendor();
  const aadhaar = await seedProduct({
    vendorId: mockVendor.id,
    name: "aadhaar-verification",
    displayName: "Aadhaar Verification",
    slug: "aadhaar-verify",
    version: "v1",
    category: "Identity",
    description:
      "Verify an Aadhaar number against the mock provider. Returns verification status and a masked name. Demo only — never send real identity data.",
    method: "POST",
    endpointPath: "/sandbox/aadhaar-verify",
    requestBodyTemplate: { aadhaar_number: "{{aadhaar_number}}", consent: "{{consent}}" },
    errorMappings: [{ match: { "result.status": "NOT_FOUND" }, code: "INVALID_DOCUMENT", message: "Aadhaar could not be verified." }],
    requireConsent: true,
    dataRetentionDays: 0,
    cost: 0.5,
    price: 1.0,
    fields: [
      {
        name: "Aadhaar Number",
        variable: "aadhaar_number",
        type: "text",
        description: "12-digit Aadhaar number (demo: 1111-2222-3333)",
        required: true,
        sensitive: true,
        store: false,
        mask: true,
        log: false,
        returnToCustomer: false,
        validation: "^[0-9\\s-]{12,16}$",
        minLength: 12,
        maxLength: 16,
        example: "1111-2222-3333",
      },
      {
        name: "Consent",
        variable: "consent",
        type: "boolean",
        description: "User consent for verification",
        required: true,
        sensitive: false,
        store: false,
        mask: false,
        log: true,
        returnToCustomer: true,
        example: "true",
      },
    ],
    mappings: [
      { providerPath: "result.status", customerField: "verification_status", fieldType: "string", mask: false, required: true },
      { providerPath: "result.name_matched", customerField: "name_matched", fieldType: "string", mask: false, required: false },
      { providerPath: "reference", customerField: "reference", fieldType: "string", mask: true, maskRule: null, required: false },
    ],
  });

  const pan = await seedProduct({
    vendorId: mockVendor.id,
    name: "pan-verification",
    displayName: "PAN Verification",
    slug: "pan-verify",
    version: "v1",
    category: "Identity",
    description:
      "Verify a PAN number against the mock provider. Returns verification status and a masked PAN. Demo only — never send real identity data.",
    method: "POST",
    endpointPath: "/sandbox/pan-verify",
    requestBodyTemplate: { pan_number: "{{pan_number}}", consent: "{{consent}}" },
    errorMappings: [{ match: { "result.status": "INVALID" }, code: "INVALID_DOCUMENT", message: "PAN could not be verified." }],
    requireConsent: true,
    dataRetentionDays: 0,
    cost: 0.5,
    price: 1.0,
    fields: [
      {
        name: "PAN Number",
        variable: "pan_number",
        type: "text",
        description: "10-character PAN (demo: AAAAA0000A)",
        required: true,
        sensitive: true,
        store: false,
        mask: true,
        log: false,
        returnToCustomer: false,
        validation: "^[A-Za-z0-9]{10}$",
        minLength: 10,
        maxLength: 10,
        example: "AAAAA0000A",
      },
      {
        name: "Consent",
        variable: "consent",
        type: "boolean",
        description: "User consent for verification",
        required: true,
        sensitive: false,
        store: false,
        mask: false,
        log: true,
        returnToCustomer: true,
        example: "true",
      },
    ],
    mappings: [
      { providerPath: "result.status", customerField: "verification_status", fieldType: "string", mask: false, required: true },
      { providerPath: "result.pan_masked", customerField: "pan_masked", fieldType: "string", mask: true, maskRule: "^(.{5})(.{5})$", required: false },
      { providerPath: "result.name_matched", customerField: "name_matched", fieldType: "string", mask: false, required: false },
      { providerPath: "reference", customerField: "reference", fieldType: "string", mask: true, maskRule: null, required: false },
    ],
  });

  console.log(`✅ Demo customer ready:`);
  console.log(`   email:    ${DEMO_EMAIL}`);
  console.log(`   password: ${DEMO_PASSWORD}`);
  console.log(`   API key:  ${apiKey}`);
  console.log(`   mode:     sandbox · plan: pro`);
  console.log(`   integrations: ${vendors.map((v) => v.slug).join(", ") || "(none — add vendors first)"}`);
  console.log(`✅ Demo provider: ${mockVendor.slug}`);
  console.log(`   sandbox:  ${MOCK_SANDBOX}`);
  console.log(`   live:     ${MOCK_LIVE}`);
  console.log(`✅ Demo products published:`);
  console.log(`   ${aadhaar.slug}@${aadhaar.version} — ${aadhaar.displayName}`);
  console.log(`   ${pan.slug}@${pan.version} — ${pan.displayName}`);
  console.log(`   Try: POST /api/v1/aadhaar-verify with {"aadhaar_number":"1111-2222-3333","consent":true}`);
  console.log(`   Or:  POST /api/v1/pan-verify    with {"pan_number":"AAAAA0000A","consent":true}`);
}

async function seedMockVerificationVendor() {
  const sandboxKey = "mock_sandbox_secret_" + Math.random().toString(36).slice(2, 10);
  const liveKey = "mock_live_secret_" + Math.random().toString(36).slice(2, 10);
  const auth = encryptAuthConfig({
    authType: "api_key",
    authHeaderName: "X-API-Key",
  });

  const vendor = await prisma.vendor.upsert({
    where: { slug: "mock-verification" },
    update: {
      name: "Mock Verification Provider",
      sandboxEndpoint: MOCK_SANDBOX,
      liveEndpoint: MOCK_LIVE,
      sandboxKeyEnc: encryptSecret(sandboxKey),
      liveKeyEnc: encryptSecret(liveKey),
      sandboxKeyFingerprint: fingerprint(sandboxKey),
      liveKeyFingerprint: fingerprint(liveKey),
      priority: 5,
      enabled: true,
      authType: auth.authType,
      authHeaderName: auth.authHeaderName,
      authQueryParam: null,
      authBasicEnc: auth.authBasicEnc,
      authExtraHeadersEnc: auth.authExtraHeadersEnc,
      authOAuthEnc: auth.authOAuthEnc,
    },
    create: {
      slug: "mock-verification",
      name: "Mock Verification Provider",
      sandboxEndpoint: MOCK_SANDBOX,
      liveEndpoint: MOCK_LIVE,
      sandboxKeyEnc: encryptSecret(sandboxKey),
      liveKeyEnc: encryptSecret(liveKey),
      sandboxKeyFingerprint: fingerprint(sandboxKey),
      liveKeyFingerprint: fingerprint(liveKey),
      priority: 5,
      enabled: true,
      authType: auth.authType,
      authHeaderName: auth.authHeaderName,
      authQueryParam: null,
      authBasicEnc: auth.authBasicEnc,
      authExtraHeadersEnc: auth.authExtraHeadersEnc,
      authOAuthEnc: auth.authOAuthEnc,
    },
    select: { id: true, slug: true },
  });
  return vendor;
}

type DemoField = {
  name: string;
  variable: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  store: boolean;
  mask: boolean;
  log: boolean;
  returnToCustomer: boolean;
  validation?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  example: string;
};

type DemoMapping = {
  providerPath: string;
  customerField: string;
  fieldType: string;
  mask: boolean;
  maskRule?: string | null;
  required: boolean;
};

async function seedProduct(input: {
  vendorId: string;
  name: string;
  displayName: string;
  slug: string;
  version: string;
  category: string;
  description: string;
  method: string;
  endpointPath: string;
  requestBodyTemplate?: Record<string, unknown> | null;
  errorMappings?: Array<Record<string, unknown>> | null;
  requireConsent: boolean;
  dataRetentionDays: number;
  cost: number;
  price: number;
  fields: DemoField[];
  mappings: DemoMapping[];
}) {
  const existing = await prisma.apiProduct.findUnique({
    where: { slug_version: { slug: input.slug, version: input.version } },
    select: { id: true },
  });

  const data = {
    vendorId: input.vendorId,
    name: input.name,
    displayName: input.displayName,
    slug: input.slug,
    version: input.version,
    category: input.category,
    description: input.description,
    status: "published",
    supportsSandbox: true,
    supportsLive: true,
    method: input.method,
    baseUrl: MOCK_SANDBOX,
    endpointPath: input.endpointPath,
    requestBodyType: "json",
    requestBodyTemplate: (input.requestBodyTemplate ?? null) as never,
    queryParams: null as never,
    pathParams: null as never,
    headers: null as never,
    responseMode: "normalized",
    normalizedResponseSchema: null as never,
    errorMappings: (input.errorMappings ?? null) as never,
    fallbackEnabled: false,
    fallbackRetryCount: 1,
    fallbackTimeoutMs: 5000,
    fallbackVendorIds: null,
    defaultCost: rupeesToPaise(input.cost),
    defaultPrice: rupeesToPaise(input.price),
    billingModel: "per_request",
    billOnSuccess: true,
    requireConsent: input.requireConsent,
    dataRetentionDays: input.dataRetentionDays,
    privacyConfig: JSON.stringify({ logResponse: false, storeResponse: false }) as never,
    fields: {
      create: input.fields.map((f, i) => ({
        name: f.name,
        variable: f.variable,
        type: f.type,
        description: f.description,
        required: f.required,
        sensitive: f.sensitive,
        store: f.store,
        mask: f.mask,
        log: f.log,
        returnToCustomer: f.returnToCustomer,
        validation: f.validation,
        minLength: f.minLength,
        maxLength: f.maxLength,
        example: f.example,
        position: i,
      })),
    },
    mappings: {
      create: input.mappings.map((m, i) => ({
        providerPath: m.providerPath,
        customerField: m.customerField,
        fieldType: m.fieldType,
        mask: m.mask,
        maskRule: m.maskRule ?? null,
        required: m.required,
        position: i,
      })),
    },
  };

  if (existing) {
    await prisma.apiProduct.delete({ where: { id: existing.id } });
  }
  const product = await prisma.apiProduct.create({
    data,
    select: { id: true, slug: true, version: true, displayName: true },
  });
  return product;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
