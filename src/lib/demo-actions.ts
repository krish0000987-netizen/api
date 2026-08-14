"use server";

import { revalidatePath } from "next/cache";
import { encryptSecret, fingerprint } from "@/lib/crypto";
import { generateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";

// Client-demo helper: the demo stores the pasted key against the local mock
// vendor so every "function" responds. Swap MOCK_SANDBOX_URL to point at a
// real vendor's sandbox endpoint when you want a live-backed demo.
const DEMO_VENDOR_SLUG = "demo-vendor";
const DEMO_SANDBOX_URL =
  process.env.MOCK_SANDBOX_URL ?? "http://localhost:9100/sandbox";

export type QuickDemoResult =
  | { ok: true; apiKey: string; masked: string; vendorName: string; slug: string }
  | { ok: false; error: string };

export async function quickDemoAction(
  formData: FormData,
): Promise<QuickDemoResult> {
  const vendorKey = String(formData.get("vendorKey") ?? "").trim();
  const vendorName =
    String(formData.get("vendorName") ?? "").trim() || "My Vendor";
  if (vendorKey.length < 8) {
    return {
      ok: false,
      error: "Paste the vendor API key first (at least 8 characters).",
    };
  }

  try {
    // 1) Lock the vendor's key into the vault — encrypted at rest, shown
    //    only as a fingerprint from now on.
    const vendor = await prisma.vendor.upsert({
      where: { slug: DEMO_VENDOR_SLUG },
      update: {
        name: vendorName,
        sandboxEndpoint: DEMO_SANDBOX_URL,
        sandboxKeyEnc: encryptSecret(vendorKey),
        sandboxKeyFingerprint: fingerprint(vendorKey),
        enabled: true,
      },
      create: {
        slug: DEMO_VENDOR_SLUG,
        name: vendorName,
        sandboxEndpoint: DEMO_SANDBOX_URL,
        sandboxKeyEnc: encryptSecret(vendorKey),
        sandboxKeyFingerprint: fingerprint(vendorKey),
        liveEndpoint: "",
        liveKeyEnc: "",
        liveKeyFingerprint: "",
        enabled: true,
        priority: 99,
      },
      select: { id: true },
    });

    // 2) Issue a fresh branded key — this is what the client's customers
    //    would get. Sandbox mode, so nothing real is ever sent or billed.
    const { apiKey, hash, lookup, masked } = await generateApiKey("sandbox");
    const customer = await prisma.customer.create({
      data: {
        email: `client-demo-${Date.now()}@demo.local`,
        apiKeyHash: hash,
        apiKeyLookup: lookup,
        apiKeyPrefix: masked,
        mode: "sandbox",
        plan: "pro",
      },
      select: { id: true },
    });
    await prisma.customerIntegration.create({
      data: { customerId: customer.id, vendorId: vendor.id, position: 0 },
    });

    revalidatePath("/");
    return {
      ok: true,
      apiKey,
      masked,
      vendorName,
      slug: DEMO_VENDOR_SLUG,
    };
  } catch (error) {
    console.error("quickDemoAction error:", error);
    return { ok: false, error: "Could not create the demo. Is the database running?" };
  }
}
