import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Revoke a secondary API key (section 8).
export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const { id } = await params;
  const row = await prisma.customerApiKey.findFirst({
    where: { id, customerId: session.user.id },
    select: { id: true },
  });
  if (!row) return NextResponse.json({ error: "API key not found" }, { status: 404 });

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

  return NextResponse.json({ ok: true });
}