// Universal API gateway (section 9, 28, 33).
//
// Catch-all route handler shared by /api/v1/[...path] and /api/v2/[...path].
// A single config-driven pipeline replaces hard-coded provider branches:
//
//   authenticate customer key
//   → rate limit
//   → load API product config (or legacy vendor)
//   → validate inputs
//   → build provider request (auth + template)
//   → call provider (with fallback + timeout)
//   → transform / redact / normalize response
//   → price + transact + usage + health
//   → return response
//
// Nothing here knows about Aadhaar, PAN, GST, etc. All behavior is driven by
// the database configuration created through the Admin Dashboard.

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { extractApiKey, stripResponseHeaders, jsonError } from "@/lib/proxy-utils";
import { checkRateLimit, incrementUsageCounter, defaultRateLimit } from "@/lib/rate-limit";
import { resolveVariables, validateFields, buildProviderRequest } from "@/lib/request-builder";
import { mapResponse, buildNormalizedResponse, normalizeError } from "@/lib/response-mapping";
import { maskValue } from "@/lib/masking";
import { buildProviderAuth, mergeHeaders } from "@/lib/provider-auth";
import { computePricing } from "@/lib/pricing";
import { generateRequestId } from "@/lib/request-id";
import { deliverWebhooks } from "@/lib/webhooks";
import { updateHealthAfterCall } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

type FieldSummary = {
  variable: string;
  name: string;
  type: string;
  required: boolean;
  sensitive: boolean;
  mask: boolean;
  store: boolean;
  log: boolean;
  returnToCustomer: boolean;
  validation: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  defaultValue: string | null;
  enumOptions: unknown;
  placeholder?: string | null;
  example?: string | null;
  maskRule?: string | null;
};

type MappingSummary = {
  providerPath: string;
  customerField: string;
  fieldType: string;
  mask: boolean;
  maskRule: string | null;
  transform: string | null;
  template: string | null;
  placement: string;
  customerPath: string | null;
  required: boolean;
  position: number;
};

type PricingRuleSummary = { customerId: string | null; price: number; enabled: boolean };

export type LoadedProduct = {
  id: string;
  slug: string;
  status: string;
  vendorId: string;
  supportsSandbox: boolean;
  supportsLive: boolean;
  method: string;
  baseUrl: string;
  endpointPath: string;
  requestBodyType: string;
  requestBodyTemplate: unknown;
  queryParams: unknown;
  pathParams: unknown;
  headers: unknown;
  responseMode: string;
  normalizedResponseSchema: unknown;
  errorMappings: unknown;
  fallbackEnabled: boolean;
  fallbackRetryCount: number;
  fallbackTimeoutMs: number;
  fallbackVendorIds: string | null;
  defaultCost: number;
  defaultPrice: number;
  billingModel: string;
  billOnSuccess: boolean;
  privacyConfig: unknown;
  vendor: {
    id: string;
    authType: string | null;
    authHeaderName: string | null;
    authQueryParam: string | null;
    authBasicEnc: string | null;
    authExtraHeadersEnc: string | null;
    authOAuthEnc: string | null;
    sandboxKeyEnc: string;
    liveKeyEnc: string;
    priority: number;
  };
  fields: FieldSummary[];
  mappings: MappingSummary[];
  pricingRules: PricingRuleSummary[];
};

export function createGatewayHandler(version: string) {
  return async function handle(request: NextRequest, { params }: RouteContext): Promise<Response> {
    try {
      const auth = await authenticate(request);
      if (!auth.ok) return jsonError(auth.status, auth.error);

      const allowed = await checkRateLimit(auth.customerId, defaultRateLimit());
      if (!allowed) return jsonError(429, "Rate limit exceeded. Slow down and try again shortly.");

      const { path } = await params;
      const [slug, ...rest] = path;
      if (!slug) return jsonError(404, "Not found.");

      const started = Date.now();
      const requestId = generateRequestId();

      const product = await prisma.apiProduct.findUnique({
        where: { slug_version: { slug, version } },
        include: {
          vendor: true,
          fields: { orderBy: { position: "asc" } },
          mappings: { orderBy: { position: "asc" } },
          pricingRules: true,
        },
      });

      if (product) {
        return handleProduct(request, auth.customerId, auth.mode, product as LoadedProduct, rest, started, requestId);
      }

      return handleVendor(request, auth.customerId, auth.mode, slug, rest, started, requestId);
    } catch (error) {
      console.error("Proxy gateway error:", error);
      return jsonError(503, "Gateway temporarily unavailable.");
    }
  };
}

// ---- Authentication ------------------------------------------------------

async function authenticate(
  request: NextRequest,
): Promise<{ ok: true; customerId: string; mode: "sandbox" | "live" } | { ok: false; status: number; error: string }> {
  const key = extractApiKey(request);
  if (!key) return { ok: false, status: 401, error: "Missing API key. Provide it as 'Authorization: Bearer <key>'." };

  const lookup = createHash("sha256").update(key).digest("hex");

  const row = await prisma.customerApiKey.findUnique({
    where: { apiKeyLookup: lookup },
    select: { id: true, customerId: true, mode: true, status: true, apiKeyHash: true },
  });
  if (row) {
    if (row.status === "revoked") {
      return { ok: false, status: 403, error: "This API key has been revoked. Generate a new one from your dashboard." };
    }
    if (!(await bcrypt.compare(key, row.apiKeyHash))) return { ok: false, status: 401, error: "Invalid API key." };
    await prisma.customerApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return { ok: true, customerId: row.customerId, mode: row.mode === "live" ? "live" : "sandbox" };
  }

  const customer = await prisma.customer.findUnique({
    where: { apiKeyLookup: lookup },
    select: { id: true, mode: true, apiKeyRevoked: true, apiKeyHash: true },
  });
  if (!customer) return { ok: false, status: 401, error: "Invalid API key." };
  if (customer.apiKeyRevoked) {
    return { ok: false, status: 403, error: "This API key has been revoked. Generate a new one from your dashboard." };
  }
  if (!(await bcrypt.compare(key, customer.apiKeyHash))) return { ok: false, status: 401, error: "Invalid API key." };
  return { ok: true, customerId: customer.id, mode: customer.mode === "live" ? "live" : "sandbox" };
}

// ---- Product route -------------------------------------------------------

async function handleProduct(
  request: NextRequest,
  customerId: string,
  mode: "sandbox" | "live",
  product: LoadedProduct,
  rest: string[],
  started: number,
  requestId: string,
): Promise<Response> {
  if (product.status !== "published") {
    return jsonError(503, "This API is not currently available.");
  }
  const useLive = mode === "live" && product.supportsLive;
  const useSandbox = mode === "sandbox" && product.supportsSandbox;
  if (!useLive && !useSandbox) {
    return jsonError(403, `This API does not support ${mode} mode.`);
  }

  const integration = await prisma.customerIntegration.findUnique({
    where: { customerId_vendorId: { customerId, vendorId: product.vendorId } },
    select: { enabled: true },
  });
  if (!integration?.enabled) {
    return jsonError(403, "This API is not enabled on your account. Contact the administrator to enable it.");
  }

  const bodyJson = await readJsonBody(request);
  const extraVars: Record<string, unknown> = {};
  for (const [k, v] of request.nextUrl.searchParams.entries()) extraVars[k] = v;
  const vars = resolveVariables(bodyJson, extraVars);

  const { errors } = validateFields(product.fields, vars);
  if (errors.length > 0) {
    return jsonError(422, errors.join(" "));
  }

  const built = buildProviderRequest(product, vars, request.nextUrl.search);

  let attempt = await callProvider(product, product.vendor, useLive, built, requestId);

  if (!attempt.ok && product.fallbackEnabled && attempt.retryable) {
    const fallbackIds = (product.fallbackVendorIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (fallbackIds.length > 0) {
      const vendors = await prisma.vendor.findMany({
        where: { id: { in: fallbackIds }, enabled: true },
        orderBy: { priority: "asc" },
      });
      for (const fallbackVendor of vendors) {
        if (attempt.ok) break;
        if (fallbackVendor.id === product.vendorId) continue;
        attempt = await callProvider(product, fallbackVendor, useLive, built, requestId);
      }
    }
  }

  const elapsed = Date.now() - started;
  const success = attempt.ok;
  const pricing = computePricing({
    defaultCost: product.defaultCost,
    defaultPrice: product.defaultPrice,
    customerRulePrice: findCustomerPrice(product, customerId),
    billingModel: product.billingModel,
    success,
  });

  const response = buildProductResponse(product, attempt, requestId);
  const usedVendorId = attempt.vendorId ?? product.vendorId;
  const environment = useLive ? "live" : "sandbox";

  await recordTransaction({
    requestId,
    customerId,
    productId: product.id,
    vendorId: usedVendorId,
    status: success ? "success" : "failed",
    httpStatus: attempt.status,
    environment,
    cost: pricing.cost,
    price: pricing.price,
    profit: pricing.profit,
    responseTimeMs: elapsed,
    errorCode: response.errorCode,
  });

  await prisma.usageEvent.create({
    data: {
      customerId,
      vendorId: usedVendorId,
      apiProductId: product.id,
      requestId,
      mode,
      environment,
      statusCode: attempt.status,
      status: success ? "success" : "failed",
      errorCode: response.errorCode,
      cost: pricing.cost,
      price: pricing.price,
      profit: pricing.profit,
      responseTimeMs: elapsed,
    },
  });
  await incrementUsageCounter(customerId, useLive ? "live" : "sandbox");
  await updateHealthAfterCall(usedVendorId, success, elapsed, attempt.status, response.errorCode);

  if (pricing.billable && product.billOnSuccess && success && pricing.price > 0) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { balance: { decrement: pricing.price } },
    });
  }

  await deliverWebhooks(customerId, product.id, {
    request_id: requestId,
    api: product.slug,
    success,
    data: response.body,
    status: attempt.status,
  });

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}

function findCustomerPrice(product: LoadedProduct, customerId: string): number | null {
  const rule = product.pricingRules.find((r) => r.customerId === customerId && r.enabled);
  if (rule) return rule.price;
  const def = product.pricingRules.find((r) => r.customerId === null && r.enabled);
  return def ? def.price : null;
}

// ---- Legacy vendor route (backward compatible, configurable auth) --------

async function handleVendor(
  request: NextRequest,
  customerId: string,
  mode: "sandbox" | "live",
  slug: string,
  rest: string[],
  started: number,
  requestId: string,
): Promise<Response> {
  const vendor = await prisma.vendor.findUnique({ where: { slug } });
  if (!vendor) return jsonError(404, `Unknown route: ${slug}.`);
  if (!vendor.enabled) return jsonError(503, "This integration is temporarily unavailable.");

  const integration = await prisma.customerIntegration.findUnique({
    where: { customerId_vendorId: { customerId, vendorId: vendor.id } },
    select: { enabled: true },
  });
  if (!integration?.enabled) {
    return jsonError(403, "This integration is not enabled on your account. Enable it in the Integration Builder first.");
  }

  const useLive = mode === "live";
  const endpoint = useLive ? vendor.liveEndpoint : vendor.sandboxEndpoint;
  const target = new URL(endpoint);
  const basePath = target.pathname.replace(/\/+$/, "");
  const extra = rest.map(encodeURIComponent).join("/");
  target.pathname = [basePath, extra].filter(Boolean).join("/");
  target.search = request.nextUrl.search;

  const { headers: authHeaders, queryParams: authQuery } = await buildProviderAuth(vendor, useLive);
  for (const [k, v] of Object.entries(authQuery)) target.searchParams.set(k, v);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("authorization");
  forwardHeaders.delete("x-api-key");
  for (const [k, v] of Object.entries(authHeaders)) forwardHeaders.set(k, v);
  forwardHeaders.delete("host");
  forwardHeaders.set("host", target.host);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: forwardHeaders,
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("Proxy upstream failure:", error);
    await recordTransaction({
      requestId,
      customerId,
      productId: null,
      vendorId: vendor.id,
      status: "error",
      httpStatus: 0,
      environment: useLive ? "live" : "sandbox",
      cost: 0,
      price: 0,
      profit: 0,
      responseTimeMs: Date.now() - started,
      errorCode: "UPSTREAM_UNREACHABLE",
    });
    return jsonError(502, "The upstream service could not be reached.");
  }

  const elapsed = Date.now() - started;
  const responseHeaders = stripResponseHeaders(upstream.headers);
  const responseBody = await upstream.arrayBuffer();

  const success = upstream.status >= 200 && upstream.status < 300;
  await prisma.usageEvent.create({
    data: {
      customerId,
      vendorId: vendor.id,
      mode,
      environment: useLive ? "live" : "sandbox",
      statusCode: upstream.status,
      status: success ? "success" : "failed",
      cost: 0,
      price: 0,
      profit: 0,
      responseTimeMs: elapsed,
    },
  });
  await incrementUsageCounter(customerId, useLive ? "live" : "sandbox");
  await updateHealthAfterCall(vendor.id, success, elapsed, upstream.status, success ? undefined : `http_${upstream.status}`);

  return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
}

// ---- Shared helpers ------------------------------------------------------

async function readJsonBody(request: NextRequest): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const text = await request.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type ProviderCallResult = {
  ok: boolean;
  status: number;
  json?: unknown;
  raw?: string;
  vendorId?: string;
  retryable: boolean;
  errorCode?: string;
};

async function callProvider(
  product: { fallbackTimeoutMs: number },
  vendor: LoadedProduct["vendor"],
  useLive: boolean,
  built: ReturnType<typeof buildProviderRequest>,
  requestId: string,
): Promise<ProviderCallResult> {
  const { headers: authHeaders, queryParams: authQuery } = await buildProviderAuth(vendor, useLive);
  const finalUrl = new URL(built.url);
  for (const [k, v] of Object.entries(authQuery)) finalUrl.searchParams.set(k, v);
  finalUrl.search = finalUrl.searchParams.toString();

  const headers = mergeHeaders(authHeaders, built.headers);
  const finalHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) finalHeaders.set(k, v);
  finalHeaders.set("x-request-id", requestId);
  finalHeaders.delete("host");
  finalHeaders.set("host", finalUrl.host);

  const timeout = Math.max(1000, product.fallbackTimeoutMs || 5000);

  let body: BodyInit | undefined;
  if (built.formData) {
    const fd = new FormData();
    for (const [k, v] of built.formData) fd.append(k, v);
    body = fd;
  } else if (built.body) {
    body = built.body;
  }

  try {
    const upstream = await fetch(finalUrl, {
      method: built.method,
      headers: finalHeaders,
      body: built.method === "GET" || built.method === "HEAD" ? undefined : body,
      signal: AbortSignal.timeout(timeout),
    });
    const raw = await upstream.text();
    let json: unknown;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    const retryable = upstream.status >= 500 || upstream.status === 408 || upstream.status === 429;
    return {
      ok: upstream.status >= 200 && upstream.status < 300,
      status: upstream.status,
      json,
      raw,
      vendorId: vendor.id,
      retryable,
      errorCode: upstream.status >= 400 ? `http_${upstream.status}` : undefined,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      status: 0,
      retryable: true,
      vendorId: vendor.id,
      errorCode: isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
    };
  }
}

function buildProductResponse(
  product: LoadedProduct,
  attempt: ProviderCallResult,
  requestId: string,
): { body: Record<string, unknown>; status: number; errorCode?: string } {
  if (attempt.ok) {
    if (product.responseMode === "normalized") {
      const mapped = mapResponse(attempt.json, product.mappings);
      const body = buildNormalizedResponse({
        success: true,
        api: product.slug,
        requestId,
        mappedFields: mapped,
        schema: product.normalizedResponseSchema,
      });
      return { body, status: attempt.status };
    }
    const redacted = redactRawResponse(attempt.json, product);
    return { body: redacted, status: attempt.status };
  }

  const error = normalizeError(attempt.json, product.errorMappings);
  const body = buildNormalizedResponse({
    success: false,
    api: product.slug,
    requestId,
    mappedFields: {},
    error,
  });
  const status = attempt.status && attempt.status >= 400 ? attempt.status : 502;
  return { body, status, errorCode: error.code };
}

/** Privacy filter for RAW mode (sections 13, 22). */
function redactRawResponse(
  json: unknown,
  product: Pick<LoadedProduct, "fields">,
): Record<string, unknown> {
  if (json === null || json === undefined) return { success: false };
  if (typeof json !== "object" || Array.isArray(json)) return { data: json };
  const fields = product.fields ?? [];
  const noReturn = new Set(fields.filter((f) => !f.returnToCustomer).map((f) => f.variable));
  const sensitiveMask = new Map(fields.filter((f) => f.sensitive && f.mask).map((f) => [f.variable, f.maskRule ?? null]));

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (noReturn.has(k)) continue;
        if (sensitiveMask.has(k)) {
          out[k] = maskValue(v, { mode: "partial", rule: sensitiveMask.get(k) });
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return value;
  };

  return walk(json) as Record<string, unknown>;
}

async function recordTransaction(input: {
  requestId: string;
  customerId: string;
  productId: string | null;
  vendorId: string;
  status: string;
  httpStatus: number | null;
  environment: string;
  cost: number;
  price: number;
  profit: number;
  responseTimeMs: number;
  errorCode?: string;
}): Promise<void> {
  try {
    await prisma.transaction.create({
      data: {
        requestId: input.requestId,
        customerId: input.customerId,
        apiProductId: input.productId,
        vendorId: input.vendorId,
        status: input.status,
        httpStatus: input.httpStatus,
        environment: input.environment,
        cost: input.cost,
        price: input.price,
        profit: input.profit,
        responseTimeMs: input.responseTimeMs,
        errorCode: input.errorCode,
      },
    });
  } catch (error) {
    console.error("Failed to record transaction:", error);
  }
}