// Response mapping engine (section 3, 24).
//
// Takes the raw provider JSON response and applies the product's
// ApiResponseMapping rules to produce the customer-facing payload:
//   providerPath -> customerField, with renaming, masking, transforms and
//   nested placement. Also normalizes provider errors into a platform format.

import { maskValue } from "@/lib/masking";
import type { ApiResponseMapping } from "@/generated/prisma/client";

export type MappingRule = Pick<
  ApiResponseMapping,
  "providerPath" | "customerField" | "fieldType" | "mask" | "maskRule" | "transform" | "template" | "placement" | "customerPath" | "required" | "position"
>;

export function getByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function applyTransform(
  value: unknown,
  transform: string | null,
  template: string | null,
): unknown {
  if (value === undefined || value === null) return value;
  switch (transform) {
    case "uppercase":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "lowercase":
      return typeof value === "string" ? value.toLowerCase() : value;
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "boolean_to_status":
      return value === true || value === "true" || value === 1 || value === "1"
        ? "verified"
        : value === false || value === "false" || value === 0 || value === "0"
          ? "unverified"
          : value;
    case "template": {
      if (!template) return value;
      const str = String(value);
      return template.replace(/\{\{\s*value\s*\}\}/g, str).replace(/\{\{\s*raw\s*\}\}/g, JSON.stringify(value));
    }
    default:
      return value;
  }
}

function maskIfNeeded(value: unknown, rule: MappingRule): unknown {
  if (!rule.mask) return value;
  if (value === null || value === undefined) return value;
  const mode = rule.maskRule === "full" ? "full" : rule.maskRule === "hidden" ? "hidden" : "partial";
  return maskValue(value, { mode, rule: mode === "partial" ? rule.maskRule : undefined });
}

export type MappedResponse = Record<string, unknown>;

/**
 * Apply the product's response mappings to the provider JSON. Returns a
 * customer-facing object. Fields whose value is missing are omitted unless
 * required (in which case they are set to null).
 */
export function mapResponse(
  providerJson: unknown,
  mappings: MappingRule[],
): MappedResponse {
  const out: MappedResponse = {};
  for (const rule of [...mappings].sort((a, b) => a.position - b.position)) {
    const raw = getByPath(providerJson, rule.providerPath);
    if (raw === undefined) {
      if (rule.required) setMappedField(out, rule, null);
      continue;
    }
    let value = applyTransform(raw, rule.transform, rule.template);
    value = maskIfNeeded(value, rule);
    setMappedField(out, rule, value);
  }
  return out;
}

function setMappedField(out: MappedResponse, rule: MappingRule, value: unknown): void {
  if (rule.placement === "nested" && rule.customerPath) {
    const parts = rule.customerPath.split(".");
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (typeof cur[key] !== "object" || cur[key] === null) {
        cur[key] = {};
      }
      cur = cur[key] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (last) cur[last] = value;
    return;
  }
  out[rule.customerField] = value;
}

/**
 * Normalize a provider error payload (section 24). errorMappings is a JSON
 * array of rules like [{ "match": { "status": false }, "code": "INVALID_DOCUMENT", "message": "..." }].
 * Matching checks provider fields equal to the given values (or a regex when
 * the value starts and ends with "/").
 */
export function normalizeError(
  providerJson: unknown,
  errorMappings?: unknown,
  fallbackMessage = "The upstream service reported an error.",
): { code: string; message: string; provider?: unknown } {
  const rules = Array.isArray(errorMappings) ? (errorMappings as Array<Record<string, unknown>>) : [];
  if (rules.length > 0 && providerJson && typeof providerJson === "object") {
    for (const rule of rules) {
      const match = rule.match as Record<string, unknown> | undefined;
      if (!match || typeof match !== "object") continue;
      let matched = true;
      for (const [path, expected] of Object.entries(match)) {
        const actual = getByPath(providerJson, path);
        let ok = false;
        if (typeof expected === "string" && expected.startsWith("/") && expected.endsWith("/")) {
          try {
            ok = new RegExp(expected.slice(1, -1)).test(String(actual ?? ""));
          } catch {
            ok = false;
          }
        } else {
          ok = actual === expected;
        }
        if (!ok) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return {
          code: String(rule.code ?? "ERROR"),
          message: String(rule.message ?? fallbackMessage),
          provider: providerJson,
        };
      }
    }
  }

  // Fallback: infer a code/message from common provider error shapes.
  const inferred = inferProviderError(providerJson);
  if (inferred) return { ...inferred, provider: providerJson };
  return { code: "PROVIDER_ERROR", message: fallbackMessage, provider: providerJson };
}

function inferProviderError(providerJson: unknown): { code: string; message: string } | null {
  if (!providerJson || typeof providerJson !== "object") return null;
  const obj = providerJson as Record<string, unknown>;
  const msg =
    typeof obj.message === "string" ? obj.message : typeof obj.error === "string" ? obj.error : null;
  const code =
    typeof obj.code === "string" ? obj.code : typeof obj.error_code === "string" ? obj.error_code : null;
  if (msg || code) return { code: code ?? "PROVIDER_ERROR", message: msg ?? "Request could not be processed." };
  return null;
}

/**
 * Build the normalized customer response (section 4, Mode 2). `mappedFields`
 * are the result of mapResponse. When a normalizedResponseSchema is set, the
 * {{field}} placeholders are resolved from mappedFields; otherwise the mapped
 * fields are placed under `data`.
 */
export function buildNormalizedResponse(input: {
  success: boolean;
  api: string;
  requestId: string;
  mappedFields: MappedResponse;
  schema?: unknown;
  error?: { code: string; message: string } | null;
  meta?: Record<string, unknown>;
}): Record<string, unknown> {
  const { success, api, requestId, mappedFields, schema, error, meta } = input;

  if (success && schema && (typeof schema === "object" || typeof schema === "string")) {
    try {
      const rendered = substituteSchema(schema, mappedFields);
      return {
        success: true,
        api,
        request_id: requestId,
        ...(rendered as Record<string, unknown>),
        ...(meta ?? {}),
      };
    } catch {
      // fall through to default shape
    }
  }

  if (success) {
    return { success: true, api, request_id: requestId, data: mappedFields, ...(meta ?? {}) };
  }

  return {
    success: false,
    api,
    request_id: requestId,
    error: error ?? { code: "ERROR", message: "Request failed." },
    ...(meta ?? {}),
  };
}

function substituteSchema(schema: unknown, fields: MappedResponse): unknown {
  if (typeof schema === "string") {
    return schema.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, name: string) => {
      const v = getByPath(fields, name);
      if (v === undefined || v === null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    });
  }
  if (Array.isArray(schema)) return schema.map((v) => substituteSchema(v, fields));
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      out[k] = substituteSchema(v, fields);
    }
    return out;
  }
  return schema;
}