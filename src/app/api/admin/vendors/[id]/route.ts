import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { vendorUpdateSchema } from "@/lib/validation";
import { encryptSecret, fingerprint } from "@/lib/crypto";
import { encryptAuthConfig } from "@/lib/auth-config";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = vendorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.vendor.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const data: Record<string, string | number | boolean | null> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.slug !== undefined) data.slug = parsed.data.slug;
  if (parsed.data.sandboxEndpoint !== undefined) data.sandboxEndpoint = parsed.data.sandboxEndpoint;
  if (parsed.data.liveEndpoint !== undefined) data.liveEndpoint = parsed.data.liveEndpoint;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  // Keys are optional on edit: a blank key keeps the existing encrypted value.
  if (parsed.data.sandboxKey !== undefined) {
    data.sandboxKeyEnc = encryptSecret(parsed.data.sandboxKey);
    data.sandboxKeyFingerprint = fingerprint(parsed.data.sandboxKey);
  }
  if (parsed.data.liveKey !== undefined) {
    data.liveKeyEnc = encryptSecret(parsed.data.liveKey);
    data.liveKeyFingerprint = fingerprint(parsed.data.liveKey);
  }
  // Auth config: only overwrite the authType when provided; secrets are only
  // re-encrypted when the admin supplies them.
  if (parsed.data.authType !== undefined) {
    const auth = encryptAuthConfig({
      authType: parsed.data.authType,
      authHeaderName: parsed.data.authHeaderName ?? null,
      authQueryParam: parsed.data.authQueryParam ?? null,
      authBasic: parsed.data.authBasic,
      authExtraHeaders: parsed.data.authExtraHeaders,
      authOAuth: parsed.data.authOAuth,
    });
    data.authType = auth.authType;
    data.authHeaderName = auth.authHeaderName;
    data.authQueryParam = auth.authQueryParam;
    if (auth.authBasicEnc) data.authBasicEnc = auth.authBasicEnc;
    if (auth.authExtraHeadersEnc) data.authExtraHeadersEnc = auth.authExtraHeadersEnc;
    if (auth.authOAuthEnc) data.authOAuthEnc = auth.authOAuthEnc;
  }

  const vendor = await prisma.vendor.update({
    where: { id },
    data,
    select: { id: true, name: true, sandboxKeyFingerprint: true, liveKeyFingerprint: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "vendor.updated",
    entity: "vendor",
    entityId: vendor.id,
    details: `name=${vendor.name}, fields=${Object.keys(data).join(",")}`,
  });

  return NextResponse.json({ vendor });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.vendor.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  await prisma.vendor.delete({ where: { id } });

  await logAudit({
    actorId: session.user.id,
    action: "vendor.deleted",
    entity: "vendor",
    entityId: id,
    details: `name=${existing.name}`,
  });

  return NextResponse.json({ ok: true });
}
