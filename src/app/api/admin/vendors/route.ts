import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { vendorCreateSchema } from "@/lib/validation";
import { encryptSecret, fingerprint } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vendors = await prisma.vendor.findMany({
    orderBy: [{ priority: "asc" }, { name: "asc" }],
    // Never select the encrypted key columns: plaintext must not leave the server.
    select: {
      id: true,
      name: true,
      sandboxEndpoint: true,
      sandboxKeyFingerprint: true,
      liveEndpoint: true,
      liveKeyFingerprint: true,
      priority: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ vendors });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = vendorCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, slug, sandboxEndpoint, sandboxKey, liveEndpoint, liveKey, priority, enabled } =
    parsed.data;

  const vendor = await prisma.vendor.create({
    data: {
      name,
      slug,
      sandboxEndpoint,
      sandboxKeyEnc: encryptSecret(sandboxKey),
      sandboxKeyFingerprint: fingerprint(sandboxKey),
      liveEndpoint,
      liveKeyEnc: encryptSecret(liveKey),
      liveKeyFingerprint: fingerprint(liveKey),
      priority,
      enabled,
    },
    select: { id: true, name: true, sandboxKeyFingerprint: true, liveKeyFingerprint: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "vendor.created",
    entity: "vendor",
    entityId: vendor.id,
    details: `name=${vendor.name}, slug=${slug}`,
  });

  return NextResponse.json({ vendor }, { status: 201 });
}
