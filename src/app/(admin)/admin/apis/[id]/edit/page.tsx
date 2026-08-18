import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { paiseToRupees } from "@/lib/pricing";
import { ApiBuilder, type BuilderProduct } from "@/components/admin/api-builder";

export const metadata = { title: "API Builder" };

export default async function EditApiPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const [product, vendors, customers] = await Promise.all([
    prisma.apiProduct.findUnique({
      where: { id },
      include: {
        fields: { orderBy: { position: "asc" } },
        mappings: { orderBy: { position: "asc" } },
        pricingRules: true,
      },
    }),
    prisma.vendor.findMany({
      where: { enabled: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ select: { id: true, email: true }, orderBy: { email: "asc" }, take: 500 }),
  ]);
  if (!product) notFound();

  const builderProduct: BuilderProduct = {
    id: product.id,
    name: product.name,
    displayName: product.displayName,
    slug: product.slug,
    version: product.version,
    category: product.category ?? "",
    description: product.description ?? "",
    providerWebsite: product.providerWebsite ?? "",
    vendorId: product.vendorId,
    status: product.status,
    supportsSandbox: product.supportsSandbox,
    supportsLive: product.supportsLive,
    method: product.method,
    baseUrl: product.baseUrl,
    endpointPath: product.endpointPath,
    requestBodyType: product.requestBodyType,
    requestBodyTemplate: product.requestBodyTemplate ? JSON.stringify(product.requestBodyTemplate, null, 2) : "",
    queryParams: (product.queryParams as Array<{ name: string; value: string }>) ?? [],
    pathParams: (product.pathParams as Array<{ name: string; value: string }>) ?? [],
    headers: (product.headers as Array<{ name: string; value: string }>) ?? [],
    responseMode: product.responseMode,
    normalizedResponseSchema: product.normalizedResponseSchema ? JSON.stringify(product.normalizedResponseSchema, null, 2) : "",
    errorMappings: product.errorMappings ? JSON.stringify(product.errorMappings, null, 2) : "[]",
    fallbackEnabled: product.fallbackEnabled,
    fallbackRetryCount: product.fallbackRetryCount,
    fallbackTimeoutMs: product.fallbackTimeoutMs,
    fallbackVendorIds: (product.fallbackVendorIds ?? "").split(",").filter(Boolean),
    defaultCost: paiseToRupees(product.defaultCost),
    defaultPrice: paiseToRupees(product.defaultPrice),
    billingModel: product.billingModel,
    billOnSuccess: product.billOnSuccess,
    requireConsent: product.requireConsent,
    dataRetentionDays: product.dataRetentionDays,
    fields: product.fields.map((f) => ({
      name: f.name,
      variable: f.variable,
      type: f.type,
      required: f.required,
      sensitive: f.sensitive,
      store: f.store,
      mask: f.mask,
      log: f.log,
      returnToCustomer: f.returnToCustomer,
      validation: f.validation ?? "",
      minLength: f.minLength,
      maxLength: f.maxLength,
      defaultValue: f.defaultValue ?? "",
      placeholder: f.placeholder ?? "",
      example: f.example ?? "",
      enumOptions: Array.isArray(f.enumOptions) ? (f.enumOptions as string[]) : [],
    })),
    mappings: product.mappings.map((m) => ({
      providerPath: m.providerPath,
      customerField: m.customerField,
      fieldType: m.fieldType,
      mask: m.mask,
      maskRule: m.maskRule ?? "",
      transform: m.transform ?? "none",
      template: m.template ?? "",
      placement: m.placement,
      customerPath: m.customerPath ?? "",
      required: m.required,
    })),
    pricingRules: product.pricingRules.map((p) => ({
      customerId: p.customerId,
      price: paiseToRupees(p.price),
      enabled: p.enabled,
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Editing <span className="font-medium">{product.displayName}</span> —{" "}
          {product.slug}@{product.version}
        </p>
      </div>
      <ApiBuilder product={builderProduct} vendors={vendors} customers={customers} />
    </div>
  );
}