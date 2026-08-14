"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { encryptSecret, fingerprint } from "@/lib/crypto";
import { generateApiKey } from "@/lib/api-keys";
import { parseCsv } from "@/lib/csv";
import { ADMIN_WIDGET_IDS, validateLayout } from "@/lib/widgets";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function reorderVendorsAction(ids: string[]): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Invalid order" };
  }

  const owned = await prisma.vendor.findMany({ select: { id: true } });
  const ownedSet = new Set(owned.map((v) => v.id));
  if (ids.some((id) => !ownedSet.has(id))) {
    return { ok: false, error: "Some vendors were not found." };
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.vendor.updateMany({ where: { id }, data: { priority: index } }),
    ),
  );

  await logAudit({
    actorId: session.user.id,
    action: "vendor.priority.reordered",
    entity: "vendor",
    details: `count=${ids.length}`,
  });
  return { ok: true };
}

export async function saveAdminDashboardLayoutAction(layout: string[]): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };

  const valid = validateLayout(layout, ADMIN_WIDGET_IDS);
  if (!valid) return { ok: false, error: "Invalid widget layout" };

  await prisma.admin.update({
    where: { id: session.user.id },
    data: { dashboardLayout: JSON.stringify(valid) },
  });
  return { ok: true };
}

// ---- Vendor config import (drop a JSON file) ----

const vendorConfigSchema = z.object({
  vendors: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        sandboxEndpoint: z.string().url(),
        sandboxKey: z.string().min(1).optional(),
        liveEndpoint: z.string().url(),
        liveKey: z.string().min(1).optional(),
        priority: z.number().int().min(0).default(0),
        enabled: z.boolean().default(true),
      }),
    )
    .min(1),
});

export async function importVendorsConfigAction(
  jsonText: string,
): Promise<{ ok: true; created: number; updated: number; errors: string[] } | { ok: false; error: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }

  const result = vendorConfigSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: "Invalid config: " + result.error.issues[0]?.message };
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const vendor of result.data.vendors) {
    try {
      const existing = await prisma.vendor.findUnique({ where: { slug: vendor.slug } });
      if (existing) {
        const data: Record<string, string | number | boolean> = {
          name: vendor.name,
          sandboxEndpoint: vendor.sandboxEndpoint,
          liveEndpoint: vendor.liveEndpoint,
          priority: vendor.priority,
          enabled: vendor.enabled,
        };
        if (vendor.sandboxKey) {
          data.sandboxKeyEnc = encryptSecret(vendor.sandboxKey);
          data.sandboxKeyFingerprint = fingerprint(vendor.sandboxKey);
        }
        if (vendor.liveKey) {
          data.liveKeyEnc = encryptSecret(vendor.liveKey);
          data.liveKeyFingerprint = fingerprint(vendor.liveKey);
        }
        await prisma.vendor.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        if (!vendor.sandboxKey || !vendor.liveKey) {
          errors.push(`${vendor.slug}: keys required for new vendors`);
          continue;
        }
        await prisma.vendor.create({
          data: {
            name: vendor.name,
            slug: vendor.slug,
            sandboxEndpoint: vendor.sandboxEndpoint,
            sandboxKeyEnc: encryptSecret(vendor.sandboxKey),
            sandboxKeyFingerprint: fingerprint(vendor.sandboxKey),
            liveEndpoint: vendor.liveEndpoint,
            liveKeyEnc: encryptSecret(vendor.liveKey),
            liveKeyFingerprint: fingerprint(vendor.liveKey),
            priority: vendor.priority,
            enabled: vendor.enabled,
          },
        });
        created++;
      }
    } catch (error) {
      console.error("Vendor import error:", error);
      errors.push(`${vendor.slug}: failed`);
    }
  }

  await logAudit({
    actorId: session.user.id,
    action: "vendor.bulk_imported",
    entity: "vendor",
    details: `created=${created}, updated=${updated}, errors=${errors.length}`,
  });
  return { ok: true, created, updated, errors };
}

// ---- Customer bulk import (drop a CSV: email,name) ----

const importCustomerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(100).optional().default(""),
});

export async function importCustomersCsvAction(csvText: string): Promise<
  | { ok: true; created: number; errors: string[]; passwords: Array<{ email: string; password: string; masked: string }> }
  | { ok: false; error: string }
> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };

  const rows = parseCsv(csvText);
  if (rows.length === 0) return { ok: false, error: "The file was empty." };

  // Skip a header row if present.
  let start = 0;
  if (rows[0][0]?.trim().toLowerCase() === "email") start = 1;

  let created = 0;
  const errors: string[] = [];
  const passwords: Array<{ email: string; password: string; masked: string }> = [];

  for (let i = start; i < rows.length; i++) {
    const [emailRaw, nameRaw] = rows[i];
    const parsed = importCustomerSchema.safeParse({ email: emailRaw ?? "", name: nameRaw ?? "" });
    if (!parsed.success) {
      errors.push(`row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const { email, name } = parsed.data;

    const password = randomBytes(9).toString("base64url");
    try {
      const { hash, lookup, masked } = await generateApiKey("sandbox");
      await prisma.customer.create({
        data: {
          email,
          name: name || null,
          passwordHash: await bcrypt.hash(password, 10),
          apiKeyHash: hash,
          apiKeyLookup: lookup,
          apiKeyPrefix: masked,
          mode: "sandbox",
          plan: "free",
        },
      });
      passwords.push({ email, password, masked });
      created++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${email}: ${msg.includes("P2002") ? "email already exists" : "failed"}`);
    }
  }

  await logAudit({
    actorId: session.user.id,
    action: "customer.bulk_imported",
    entity: "customer",
    details: `created=${created}, errors=${errors.length}`,
  });
  return { ok: true, created, errors, passwords };
}

// ---- Customer key management (admin) ----

export async function adminRevokeKeyAction(customerId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, email: true } });
  if (!customer) return { ok: false, error: "Customer not found" };

  await prisma.customer.update({ where: { id: customerId }, data: { apiKeyRevoked: true } });
  await logAudit({
    actorId: session.user.id,
    action: "customer.key.revoked",
    entity: "customer",
    entityId: customerId,
    details: `email=${customer.email}`,
  });
  return { ok: true };
}

export async function adminReissueKeyAction(
  customerId: string,
): Promise<{ ok: true; apiKey: string; masked: string; email: string } | { ok: false; error: string }> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Not authorized" };

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, email: true, mode: true },
  });
  if (!customer) return { ok: false, error: "Customer not found" };

  const mode = customer.mode === "live" ? "live" : "sandbox";
  const { apiKey, hash, lookup, masked } = await generateApiKey(mode);

  await prisma.customer.update({
    where: { id: customerId },
    data: { apiKeyHash: hash, apiKeyLookup: lookup, apiKeyPrefix: masked, apiKeyRevoked: false },
  });
  await logAudit({
    actorId: session.user.id,
    action: "customer.key.reissued",
    entity: "customer",
    entityId: customerId,
    details: `email=${customer.email}`,
  });
  return { ok: true, apiKey, masked, email: customer.email };
}
