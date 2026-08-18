import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { apiProductCreateSchema } from "@/lib/product-schema";
import { rupeesToPaise } from "@/lib/pricing";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.apiProduct.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      vendor: { select: { id: true, name: true, slug: true } },
      _count: { select: { fields: true, mappings: true, usageEvents: true } },
    },
  });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = apiProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;

  // Slug+version must be unique.
  const existing = await prisma.apiProduct.findUnique({
    where: { slug_version: { slug: d.slug, version: d.version } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: `An API named "${d.slug}" already exists at version ${d.version}.` }, { status: 409 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: d.vendorId }, select: { id: true } });
  if (!vendor) return NextResponse.json({ error: "Provider not found" }, { status: 400 });

  const product = await prisma.apiProduct.create({
    data: {
      name: d.name,
      displayName: d.displayName,
      slug: d.slug,
      version: d.version,
      category: d.category,
      description: d.description,
      logo: d.logo,
      providerWebsite: d.providerWebsite,
      vendorId: d.vendorId,
      status: d.status,
      supportsSandbox: d.supportsSandbox,
      supportsLive: d.supportsLive,
      method: d.method,
      baseUrl: d.baseUrl,
      endpointPath: d.endpointPath,
      requestBodyType: d.requestBodyType,
      requestBodyTemplate: (d.requestBodyTemplate ?? null) as never,
      queryParams: (d.queryParams ?? null) as never,
      pathParams: (d.pathParams ?? null) as never,
      headers: (d.headers ?? null) as never,
      responseMode: d.responseMode,
      normalizedResponseSchema: (d.normalizedResponseSchema ?? null) as never,
      errorMappings: (d.errorMappings ?? null) as never,
      fallbackEnabled: d.fallbackEnabled,
      fallbackRetryCount: d.fallbackRetryCount,
      fallbackTimeoutMs: d.fallbackTimeoutMs,
      fallbackVendorIds: d.fallbackVendorIds.join(","),
      defaultCost: rupeesToPaise(d.defaultCost),
      defaultPrice: rupeesToPaise(d.defaultPrice),
      billingModel: d.billingModel,
      billOnSuccess: d.billOnSuccess,
      requireConsent: d.requireConsent,
      dataRetentionDays: d.dataRetentionDays,
      privacyConfig: (d.privacyConfig ?? null) as never,
      fields: {
        create: d.fields.map((f, i) => ({
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
        })),
      },
      mappings: {
        create: d.mappings.map((m, i) => ({
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
      },
      pricingRules: {
        create: d.pricingRules.map((p) => ({
          customerId: p.customerId,
          price: rupeesToPaise(p.price),
          enabled: p.enabled,
        })),
      },
    },
    select: { id: true, name: true, slug: true, version: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "api.product.created",
    entity: "api_product",
    entityId: product.id,
    details: `name=${product.name}, slug=${product.slug}@${product.version}`,
  });

  return NextResponse.json({ product }, { status: 201 });
}