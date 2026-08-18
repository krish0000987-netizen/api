"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateApiKey } from "@/lib/api-keys";
import { CUSTOMER_WIDGET_IDS, validateLayout } from "@/lib/widgets";

type ActionResult = { ok: true } | { ok: false; error: string };

// Actions that issue a brand-new key always return the full key (shown once).
type KeyResult = { ok: true; apiKey: string; masked: string } | { ok: false; error: string };

const signupSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

export async function signupAction(formData: FormData): Promise<KeyResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with this email already exists. Try logging in." };
  }

  // New customers start in sandbox mode with a sk_test_ key.
  const { apiKey, hash, lookup, masked } = await generateApiKey("sandbox");
  const passwordHash = await bcrypt.hash(password, 10);

  const customer = await prisma.customer.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      mode: "sandbox",
      plan: "free",
    },
    select: { id: true },
  });

  await logAudit({
    actorId: customer.id,
    action: "customer.signed_up",
    entity: "customer",
    entityId: customer.id,
    details: `email=${email}, provider=credentials`,
  });

  // Create the session so the new account is logged in immediately.
  await signIn("credentials", { email, password, redirect: false });

  return { ok: true, apiKey, masked };
}

export async function setModeAction(mode: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return { ok: false, error: "Not authorized" };
  }
  if (mode !== "sandbox" && mode !== "live") {
    return { ok: false, error: "Mode must be sandbox or live" };
  }

  await prisma.customer.update({ where: { id: session.user.id }, data: { mode } });
  await logAudit({
    actorId: session.user.id,
    action: "customer.mode.changed",
    entity: "customer",
    entityId: session.user.id,
    details: `mode=${mode}`,
  });
  return { ok: true };
}

export async function regenerateKeyAction(): Promise<KeyResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return { ok: false, error: "Not authorized" };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { mode: true },
  });
  if (!customer) return { ok: false, error: "Account not found" };

  // A regenerated key matches the customer's current mode (sk_test_ / sk_live_).
  const mode = customer.mode === "live" ? "live" : "sandbox";
  const { apiKey, hash, lookup, masked } = await generateApiKey(mode);

  await prisma.customer.update({
    where: { id: session.user.id },
    data: {
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      apiKeyRevoked: false,
    },
  });

  await logAudit({
    actorId: session.user.id,
    action: "customer.key.regenerated",
    entity: "customer",
    entityId: session.user.id,
    details: `mode=${mode}`,
  });

  return { ok: true, apiKey, masked };
}

export async function revokeKeyAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return { ok: false, error: "Not authorized" };
  }

  await prisma.customer.update({
    where: { id: session.user.id },
    data: { apiKeyRevoked: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "customer.key.revoked",
    entity: "customer",
    entityId: session.user.id,
  });

  return { ok: true };
}

// ---- Integration Builder ----

async function requireCustomer() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") return null;
  return session;
}

export async function enableIntegrationAction(vendorId: string): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, enabled: true, slug: true },
  });
  if (!vendor || !vendor.enabled) {
    return { ok: false, error: "This service is not available." };
  }

  const existing = await prisma.customerIntegration.findUnique({
    where: { customerId_vendorId: { customerId: session.user.id, vendorId } },
    select: { id: true, enabled: true },
  });

  if (existing) {
    if (!existing.enabled) {
      await prisma.customerIntegration.update({ where: { id: existing.id }, data: { enabled: true } });
    }
  } else {
    const position = await prisma.customerIntegration.count({ where: { customerId: session.user.id } });
    await prisma.customerIntegration.create({
      data: { customerId: session.user.id, vendorId, position },
    });
  }

  await logAudit({
    actorId: session.user.id,
    action: "customer.integration.enabled",
    entity: "customer",
    entityId: session.user.id,
    details: `vendor=${vendor.slug}`,
  });
  return { ok: true };
}

export async function disableIntegrationAction(vendorId: string): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { slug: true } });
  await prisma.customerIntegration.deleteMany({
    where: { customerId: session.user.id, vendorId },
  });

  await logAudit({
    actorId: session.user.id,
    action: "customer.integration.disabled",
    entity: "customer",
    entityId: session.user.id,
    details: `vendor=${vendor?.slug ?? vendorId}`,
  });
  return { ok: true };
}

export async function reorderIntegrationsAction(ids: string[]): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Invalid order" };
  }

  const owned = await prisma.customerIntegration.findMany({
    where: { customerId: session.user.id },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((i) => i.id));
  if (ids.some((id) => !ownedSet.has(id))) {
    return { ok: false, error: "Some items were not yours." };
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.customerIntegration.updateMany({
        where: { id, customerId: session.user.id },
        data: { position: index },
      }),
    ),
  );
  return { ok: true };
}

export async function saveDashboardLayoutAction(layout: string[]): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const valid = validateLayout(layout, CUSTOMER_WIDGET_IDS);
  if (!valid) return { ok: false, error: "Invalid widget layout" };

  await prisma.customer.update({
    where: { id: session.user.id },
    data: { dashboardLayout: JSON.stringify(valid) },
  });
  return { ok: true };
}

// ---- API product access (customer) ----

export async function enableProductAction(productId: string): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const product = await prisma.apiProduct.findUnique({
    where: { id: productId },
    select: { id: true, vendorId: true, slug: true, status: true },
  });
  if (!product || product.status !== "published") {
    return { ok: false, error: "This API is not available." };
  }

  // Enabling a product enables its provider at the vendor level.
  const existing = await prisma.customerIntegration.findUnique({
    where: { customerId_vendorId: { customerId: session.user.id, vendorId: product.vendorId } },
    select: { id: true, enabled: true },
  });
  if (existing) {
    if (!existing.enabled) {
      await prisma.customerIntegration.update({ where: { id: existing.id }, data: { enabled: true } });
    }
  } else {
    const position = await prisma.customerIntegration.count({ where: { customerId: session.user.id } });
    await prisma.customerIntegration.create({
      data: { customerId: session.user.id, vendorId: product.vendorId, position },
    });
  }

  await logAudit({
    actorId: session.user.id,
    action: "customer.product.enabled",
    entity: "customer",
    entityId: session.user.id,
    details: `product=${product.slug}`,
  });
  return { ok: true };
}

export async function disableProductAction(productId: string): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const product = await prisma.apiProduct.findUnique({
    where: { id: productId },
    select: { vendorId: true, slug: true },
  });
  if (!product) return { ok: false, error: "API not found" };

  // Only disable if no other enabled product uses this provider.
  const otherEnabled = await prisma.apiProduct.count({
    where: { vendorId: product.vendorId, status: "published", id: { not: productId } },
  });
  if (otherEnabled > 0) {
    // Keep the vendor integration but note it; the gateway gates per product.
    return { ok: true };
  }
  await prisma.customerIntegration.deleteMany({
    where: { customerId: session.user.id, vendorId: product.vendorId },
  });
  return { ok: true };
}

// ---- Secondary API keys (section 8) ----

export async function createApiKeyAction(
  name: string,
  mode: string,
): Promise<{ ok: true; apiKey: string; masked: string; id: string } | { ok: false; error: string }> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };
  if (mode !== "sandbox" && mode !== "live") return { ok: false, error: "Mode must be sandbox or live" };

  const clean = name.trim().slice(0, 100);
  const { apiKey, hash, lookup, masked } = await generateApiKey(mode as "sandbox" | "live");
  const row = await prisma.customerApiKey.create({
    data: {
      customerId: session.user.id,
      name: clean || null,
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      mode,
      status: "active",
    },
    select: { id: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "customer.key.created",
    entity: "customer",
    entityId: session.user.id,
    details: `mode=${mode}, name=${clean || "unnamed"}`,
  });
  return { ok: true, apiKey, masked, id: row.id };
}

export async function revokeApiKeyRowAction(id: string): Promise<ActionResult> {
  const session = await requireCustomer();
  if (!session) return { ok: false, error: "Not authorized" };

  const row = await prisma.customerApiKey.findFirst({
    where: { id, customerId: session.user.id },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "API key not found" };

  await prisma.customerApiKey.update({
    where: { id },
    data: { status: "revoked", revokedAt: new Date() },
  });
  await logAudit({
    actorId: session.user.id,
    action: "customer.key.revoked",
    entity: "customer",
    entityId: session.user.id,
  });
  return { ok: true };
}
