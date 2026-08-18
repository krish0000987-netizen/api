import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { paiseToRupees } from "@/lib/pricing";

type RouteContext = { params: Promise<{ slug: string }> };

// Machine-readable OpenAPI 3.0 spec for a published product (section 7 docs).
export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const product = await prisma.apiProduct.findFirst({
    where: { slug, status: "published" },
    orderBy: { version: "desc" },
    include: {
      fields: { orderBy: { position: "asc" } },
      mappings: { orderBy: { position: "asc" } },
    },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of product.fields) {
    properties[f.variable] = {
      type: f.type === "number" ? "number" : f.type === "boolean" ? "boolean" : "string",
      title: f.name,
      description: f.validation ?? undefined,
      example: f.example ?? undefined,
      format: f.validation ?? undefined,
    };
    if (f.required) required.push(f.variable);
  }

  const responseProps: Record<string, unknown> = {
    success: { type: "boolean", example: true },
    api: { type: "string", example: product.slug },
    request_id: { type: "string" },
  };
  if (product.mappings.length > 0) {
    const data: Record<string, unknown> = {};
    for (const m of product.mappings) {
      data[m.customerField] = { type: "string", example: "value" };
    }
    responseProps.data = { type: "object", properties: data };
  } else {
    responseProps.data = { type: "object", description: "Raw provider payload (privacy-redacted)" };
  }

  const price = paiseToRupees(product.defaultPrice);
  const pathItem: Record<string, unknown> = {
    summary: product.displayName,
    description: product.description ?? undefined,
    operationId: product.slug,
    parameters: [
      { name: "X-Environment", in: "header", schema: { type: "string", enum: ["sandbox", "live"] } },
    ],
    requestBody: {
      required: required.length > 0,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties,
            required: required.length > 0 ? required : undefined,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Success",
        content: { "application/json": { schema: { type: "object", properties: responseProps } } },
      },
      "400": { description: "Missing or invalid fields" },
      "401": { description: "Missing or invalid API key" },
      "402": { description: "Insufficient balance" },
      "422": { description: "Verification failed" },
      "429": { description: "Rate limited" },
      "500": { description: "Provider error" },
    },
  };

  const spec = {
    openapi: "3.0.3",
    info: {
      title: product.displayName,
      description: `${product.description ?? ""}\n\nPrice: ₹${price.toFixed(2)} per request.`.trim(),
      version: `v${product.version}`,
    },
    servers: [{ url: `/api/v1`, description: "White-label gateway" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths: { [`/${product.slug}`]: { [product.method.toLowerCase()]: pathItem } },
  };

  return NextResponse.json(spec);
}