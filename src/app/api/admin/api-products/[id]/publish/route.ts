import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Toggle a product's publish state (section 31): draft / published / disabled.
export async function POST(request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.apiProduct.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, version: true, status: true },
  });
  if (!product) return NextResponse.json({ error: "API product not found" }, { status: 404 });

  let target: string;
  try {
    const body = (await request.json()) as { status?: string };
    if (body.status && ["draft", "published", "disabled"].includes(body.status)) {
      target = body.status;
    } else {
      target = product.status === "published" ? "disabled" : "published";
    }
  } catch {
    target = product.status === "published" ? "disabled" : "published";
  }

  const updated = await prisma.apiProduct.update({ where: { id }, data: { status: target } });

  await logAudit({
    actorId: session.user.id,
    action: `api.product.${target === "published" ? "published" : target === "disabled" ? "disabled" : "drafted"}`,
    entity: "api_product",
    entityId: id,
    details: `slug=${product.slug}@${product.version}`,
  });

  return NextResponse.json({ status: updated.status });
}