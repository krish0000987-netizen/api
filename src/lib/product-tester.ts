// Universal API Tester (section 6, 32): runs a full product pipeline in the
// admin's context (sandbox by default, no billing). Returns everything the
// API Tester UI needs — request URL/headers/body (secrets masked), provider
// response, normalized response, and a human-readable view.

import { prisma } from "@/lib/prisma";
import { resolveVariables, validateFields, buildProviderRequest } from "@/lib/request-builder";
import { mapResponse, buildNormalizedResponse, normalizeError } from "@/lib/response-mapping";
import { buildProviderAuth, mergeHeaders } from "@/lib/provider-auth";
import { maskValue } from "@/lib/masking";
import { generateRequestId } from "@/lib/request-id";
import type { LoadedProduct } from "@/lib/gateway";

export type TesterResult = {
  ok: boolean;
  request_id: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };
  provider: {
    status: number;
    timeMs: number;
    raw: unknown;
  } | null;
  response: unknown;
  human: Array<{ label: string; value: string; sensitive?: boolean }>;
  errors: string[];
  mode: string;
};

const SENSITIVE_HEADER_NAMES = new Set(["authorization", "x-api-key", "api-key", "apikey", "x-auth-token", "token"]);

function maskHeader(name: string, value: string): string {
  if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) {
    return maskValue(value, { mode: "full" });
  }
  return value;
}

export async function runProductTest(input: {
  productId: string;
  mode?: "sandbox" | "live";
  body?: unknown;
  query?: Record<string, string>;
}): Promise<TesterResult> {
  const requestId = generateRequestId();
  const base: TesterResult = {
    ok: false,
    request_id: requestId,
    request: { url: "", method: "", headers: {}, body: null },
    provider: null,
    response: null,
    human: [],
    errors: [],
    mode: input.mode ?? "sandbox",
  };

  const product = await prisma.apiProduct.findUnique({
    where: { id: input.productId },
    include: {
      vendor: true,
      fields: { orderBy: { position: "asc" } },
      mappings: { orderBy: { position: "asc" } },
    },
  });
  if (!product) {
    return { ...base, errors: ["API product not found."] };
  }
  const p = product as unknown as LoadedProduct;

  const useLive = input.mode === "live" && p.supportsLive;
  if (input.mode === "live" && !p.supportsLive) {
    return { ...base, errors: ["This API does not support live mode."] };
  }

  const vars = resolveVariables(input.body ?? {}, input.query ?? {});
  const { errors } = validateFields(p.fields, vars);
  if (errors.length > 0) {
    return { ...base, errors };
  }

  const built = buildProviderRequest(p, vars, new URLSearchParams(input.query ?? {}).toString());
  const { headers: authHeaders, queryParams: authQuery } = await buildProviderAuth(p.vendor, useLive);
  const finalUrl = new URL(built.url);
  for (const [k, v] of Object.entries(authQuery)) finalUrl.searchParams.set(k, v);
  finalUrl.search = finalUrl.searchParams.toString();
  const headers = mergeHeaders(authHeaders, built.headers);

  const maskedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) maskedHeaders[k] = maskHeader(k, v);

  base.request = {
    url: finalUrl.toString(),
    method: built.method,
    headers: maskedHeaders,
    body: built.body ?? null,
  };

  const timeout = Math.max(1000, p.fallbackTimeoutMs || 5000);
  let bodyInit: BodyInit | undefined;
  if (built.formData) {
    const fd = new FormData();
    for (const [k, v] of built.formData) fd.append(k, v);
    bodyInit = fd;
  } else if (built.body) {
    bodyInit = built.body;
  }

  const finalHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) finalHeaders.set(k, v);
  finalHeaders.set("x-request-id", requestId);
  finalHeaders.delete("host");
  finalHeaders.set("host", finalUrl.host);

  const started = Date.now();
  let provider: TesterResult["provider"] = null;
  let rawJson: unknown = null;

  try {
    const upstream = await fetch(finalUrl, {
      method: built.method,
      headers: finalHeaders,
      body: built.method === "GET" || built.method === "HEAD" ? undefined : bodyInit,
      signal: AbortSignal.timeout(timeout),
    });
    const text = await upstream.text();
    try {
      rawJson = text ? JSON.parse(text) : null;
    } catch {
      rawJson = text;
    }
    provider = { status: upstream.status, timeMs: Date.now() - started, raw: rawJson };

    if (upstream.status >= 200 && upstream.status < 300) {
      let response: unknown;
      if (p.responseMode === "normalized") {
        const mapped = mapResponse(rawJson, p.mappings);
        response = buildNormalizedResponse({
          success: true,
          api: p.slug,
          requestId,
          mappedFields: mapped,
          schema: p.normalizedResponseSchema,
        });
      } else {
        response = rawJson;
      }
      return {
        ...base,
        ok: true,
        provider,
        response,
        human: buildHumanView(p, rawJson, true),
      };
    }

    const error = normalizeError(rawJson, p.errorMappings);
    return {
      ...base,
      provider,
      response: buildNormalizedResponse({ success: false, api: p.slug, requestId, mappedFields: {}, error }),
      human: buildHumanView(p, rawJson, false),
      errors: [`Provider returned HTTP ${upstream.status}.`, error.message],
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ...base,
      provider: { status: 0, timeMs: Date.now() - started, raw: null },
      errors: [isTimeout ? `Provider timed out after ${timeout}ms.` : `Provider unreachable: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

function buildHumanView(product: LoadedProduct, raw: unknown, success: boolean): Array<{ label: string; value: string; sensitive?: boolean }> {
  const rows: Array<{ label: string; value: string; sensitive?: boolean }> = [];
  const mapped = mapResponse(raw, product.mappings);
  for (const rule of [...product.mappings].sort((a, b) => a.position - b.position)) {
    const value = mapped[rule.customerField];
    const label = rule.customerField
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase());
    const sensitive = rule.mask || product.fields.some((f) => f.variable === rule.customerField && f.sensitive);
    if (value === undefined || value === null) {
      rows.push({ label, value: "—", sensitive });
      continue;
    }
    rows.push({
      label,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
      sensitive,
    });
  }
  rows.push({ label: "Verification Status", value: success ? "✓ Verified" : "✗ Failed" });
  return rows;
}