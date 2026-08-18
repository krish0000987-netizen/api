import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; action: string }> };

// Enable/disable an API product for the signed-in customer (section 7).
export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const { id, action } = await params;
  if (action !== "enable" && action !== "disable") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const product = await prisma.apiProduct.findUnique({
    where: { id },
    select: { id: true, vendorId: true, slug: true, status: true },
  });
  if (!product) return NextResponse.json({ error: "API not found" }, { status: 404 });
  if (action === "enable" && product.status !== "published") {
    return NextResponse.json({ error: "This API is not available." }, { status: 403 });
  }

  if (action === "enable") {
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
  } else {
    await prisma.customerIntegration.deleteMany({
      where: { customerId: session.user.id, vendorId: product.vendorId },
    });
  }

  await logAudit({
    actorId: session.user.id,
    action: `customer.product.${action}d`,
    entity: "customer",
    entityId: session.user.id,
    details: `product=${product.slug}`,
  });

  return NextResponse.json({ ok: true });
}