import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Duplicate a product as a draft (section 31). The copy keeps everything but
// the status (draft) so the admin can review before publishing.
export async function POST(request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.apiProduct.findUnique({
    where: { id },
    include: { fields: true, mappings: true, pricingRules: true },
  });
  if (!product) return NextResponse.json({ error: "API product not found" }, { status: 404 });

  // Find an unused slug.
  let slug = `${product.slug}-copy`;
  const version = product.version;
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? slug : `${product.slug}-copy-${i}`;
    const exists = await prisma.apiProduct.findUnique({
      where: { slug_version: { slug: candidate, version } },
      select: { id: true },
    });
    if (!exists) {
      slug = candidate;
      break;
    }
  }

  const copy = await prisma.apiProduct.create({
    data: {
      name: `${product.name} (copy)`,
      displayName: product.displayName,
      slug,
      version,
      category: product.category,
      description: product.description,
      logo: product.logo,
      providerWebsite: product.providerWebsite,
      vendorId: product.vendorId,
      status: "draft",
      supportsSandbox: product.supportsSandbox,
      supportsLive: product.supportsLive,
      method: product.method,
      baseUrl: product.baseUrl,
      endpointPath: product.endpointPath,
      requestBodyType: product.requestBodyType,
      requestBodyTemplate: product.requestBodyTemplate as never,
      queryParams: product.queryParams as never,
      pathParams: product.pathParams as never,
      headers: product.headers as never,
      responseMode: product.responseMode,
      normalizedResponseSchema: product.normalizedResponseSchema as never,
      errorMappings: product.errorMappings as never,
      fallbackEnabled: product.fallbackEnabled,
      fallbackRetryCount: product.fallbackRetryCount,
      fallbackTimeoutMs: product.fallbackTimeoutMs,
      fallbackVendorIds: product.fallbackVendorIds,
      defaultCost: product.defaultCost,
      defaultPrice: product.defaultPrice,
      billingModel: product.billingModel,
      billOnSuccess: product.billOnSuccess,
      requireConsent: product.requireConsent,
      dataRetentionDays: product.dataRetentionDays,
      privacyConfig: product.privacyConfig as never,
      fields: {
        create: product.fields.map((f) => ({
          name: f.name,
          variable: f.variable,
          type: f.type,
          description: f.description,
          required: f.required,
          sensitive: f.sensitive,
          store: f.store,
          mask: f.mask,
          log: f.log,
          returnToCustomer: f.returnToCustomer,
          validation: f.validation,
          minLength: f.minLength,
          maxLength: f.maxLength,
          minValue: f.minValue,
          maxValue: f.maxValue,
          defaultValue: f.defaultValue,
          placeholder: f.placeholder,
          example: f.example,
          enumOptions: f.enumOptions as never,
          position: f.position,
        })),
      },
      mappings: {
        create: product.mappings.map((m) => ({
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
          position: m.position,
        })),
      },
      pricingRules: {
        create: product.pricingRules.map((p) => ({
          customerId: p.customerId,
          price: p.price,
          enabled: p.enabled,
        })),
      },
    },
    select: { id: true, slug: true, version: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "api.product.duplicated",
    entity: "api_product",
    entityId: copy.id,
    details: `from=${product.slug}@${product.version}, to=${slug}@${version}`,
  });

  return NextResponse.json({ product: copy }, { status: 201 });
}