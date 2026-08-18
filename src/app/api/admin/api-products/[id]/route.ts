import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { apiProductUpdateSchema } from "@/lib/product-schema";
import { rupeesToPaise } from "@/lib/pricing";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.apiProduct.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, slug: true } },
      fields: { orderBy: { position: "asc" } },
      mappings: { orderBy: { position: "asc" } },
      pricingRules: true,
      documentation: true,
    },
  });
  if (!product) return NextResponse.json({ error: "API product not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.apiProduct.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) return NextResponse.json({ error: "API product not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = apiProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Slug/version uniqueness (exclude self).
  if (d.slug || d.version) {
    const slug = d.slug ?? (existing as { slug?: string }).slug ?? "";
    const version = d.version ?? "";
    if (slug && version) {
      const dup = await prisma.apiProduct.findUnique({ where: { slug_version: { slug, version } } });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `Another API already uses ${slug}@${version}.` }, { status: 409 });
      }
    }
  }

  const scalar: Record<string, unknown> = {};
  const scalarKeys = [
    "name", "displayName", "slug", "version", "category", "description", "logo",
    "providerWebsite", "vendorId", "status", "supportsSandbox", "supportsLive",
    "method", "baseUrl", "endpointPath", "requestBodyType", "requestBodyTemplate",
    "queryParams", "pathParams", "headers", "responseMode", "normalizedResponseSchema",
    "errorMappings", "fallbackEnabled", "fallbackRetryCount", "fallbackTimeoutMs",
    "billingModel", "billOnSuccess", "requireConsent", "dataRetentionDays", "privacyConfig",
  ] as const;

  for (const key of scalarKeys) {
    if (d[key] !== undefined) scalar[key] = d[key] as never;
  }
  if (d.defaultCost !== undefined) scalar.defaultCost = rupeesToPaise(d.defaultCost as number);
  if (d.defaultPrice !== undefined) scalar.defaultPrice = rupeesToPaise(d.defaultPrice as number);
  if (d.fallbackVendorIds !== undefined) scalar.fallbackVendorIds = (d.fallbackVendorIds as string[]).join(",");

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.apiProduct.update({ where: { id }, data: scalar as never });

    if (d.fields) {
      await tx.apiField.deleteMany({ where: { productId: id } });
      if (d.fields.length > 0) {
        await tx.apiField.createMany({
          data: d.fields.map((f, i) => ({
            productId: id,
            name: f.name,
            variable: f.variable,
            type: f.type,
            description: f.description || null,
            required: f.required,
            sensitive: f.sensitive,
            store: f.store,
            mask: f.mask,
            log: f.log,
            returnToCustomer: f.returnToCustomer,
            validation: f.validation || null,
            minLength: f.minLength,
            maxLength: f.maxLength,
            minValue: f.minValue,
            maxValue: f.maxValue,
            defaultValue: f.defaultValue,
            placeholder: f.placeholder,
            example: f.example,
            enumOptions: f.enumOptions.length > 0 ? f.enumOptions : undefined,
            position: i,
          })) as never,
        });
      }
    }

    if (d.mappings) {
      await tx.apiResponseMapping.deleteMany({ where: { productId: id } });
      if (d.mappings.length > 0) {
        await tx.apiResponseMapping.createMany({
          data: d.mappings.map((m, i) => ({
            productId: id,
            providerPath: m.providerPath,
            customerField: m.customerField,
            fieldType: m.fieldType,
            mask: m.mask,
            maskRule: m.maskRule,
            transform: m.transform,
            template: m.template,
            placement: m.placement,
            customerPath: m.customerPath,
            required: m.required,
            position: i,
          })),
        });
      }
    }

    if (d.pricingRules) {
      await tx.pricingRule.deleteMany({ where: { productId: id } });
      if (d.pricingRules.length > 0) {
        await tx.pricingRule.createMany({
          data: d.pricingRules.map((p) => ({
            productId: id,
            customerId: p.customerId,
            price: rupeesToPaise(p.price),
            enabled: p.enabled,
          })),
        });
      }
    }

    return updated;
  });

  await logAudit({
    actorId: session.user.id,
    action: "api.product.updated",
    entity: "api_product",
    entityId: product.id,
    details: `name=${product.name}, slug=${product.slug}@${product.version}`,
  });

  return NextResponse.json({ product });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.apiProduct.findUnique({ where: { id }, select: { id: true, name: true, slug: true, version: true } });
  if (!existing) return NextResponse.json({ error: "API product not found" }, { status: 404 });

  await prisma.apiProduct.delete({ where: { id } });
  await logAudit({
    actorId: session.user.id,
    action: "api.product.deleted",
    entity: "api_product",
    entityId: id,
    details: `name=${existing.name}, slug=${existing.slug}@${existing.version}`,
  });
  return NextResponse.json({ ok: true });
}