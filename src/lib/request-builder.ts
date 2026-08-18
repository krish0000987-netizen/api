// Request builder & input validation for the universal gateway.
//
// Products declare a request template (JSON / form / urlencoded / raw) with
// {{variable}} placeholders plus a schema of input fields. This module:
//   1. resolves customer-provided values into a variable map (supporting
//      top-level keys and dot-paths like documentData.aadhaar_number),
//   2. validates them against the field schema (type, regex, length, enums),
//   3. renders the provider request (URL, headers, body) by substituting the
//      variables into the template.

import type { ApiField, ApiProduct } from "@/generated/prisma/client";

export type FieldSchema = Omit<
  Pick<
    ApiField,
    "variable" | "name" | "type" | "required" | "sensitive" | "mask" | "store" | "log" | "returnToCustomer" | "validation" | "minLength" | "maxLength" | "minValue" | "maxValue" | "defaultValue"
  >,
  never
> & { enumOptions?: unknown };

export type ResolvedVariables = Record<string, unknown>;

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.\[\]-]+)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_PATTERN)) out.add(m[1]);
  return [...out];
}

function getByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object") return undefined;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Build a flat variable map from the customer's JSON body. Supports exact
 * top-level keys, dot-path keys (documentData.aadhaar_number), and nested
 * access where the request body itself uses nesting.
 */
export function resolveVariables(body: unknown, extra?: Record<string, unknown>): ResolvedVariables {
  const vars: ResolvedVariables = { ...(extra ?? {}) };
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      vars[key] = value;
    }
  }
  return vars;
}

export function resolveByPath(body: unknown, path: string): unknown {
  return getByPath(body, path);
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "text":
    case "textarea":
    case "file":
      return typeof value === "string";
    case "number":
      return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)));
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "phone":
      return typeof value === "string" && /^[+]?[0-9\s()-]{7,20}$/.test(value);
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "boolean":
      return typeof value === "boolean" || value === "true" || value === "false" || value === 0 || value === 1;
    case "json":
      try {
        if (typeof value === "string") JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    case "select":
      return typeof value === "string" || typeof value === "number";
    default:
      return true;
  }
}

/**
 * Validate customer-supplied variables against the product's field schema.
 * Returns errors plus the coerced values map.
 */
export function validateFields(
  fields: FieldSchema[],
  vars: ResolvedVariables,
): { errors: string[]; values: ResolvedVariables } {
  const errors: string[] = [];
  const values: ResolvedVariables = { ...vars };

  for (const field of fields) {
    let value: unknown = getByPath(vars, field.variable);
    if (value === undefined && field.variable in vars) value = vars[field.variable];
    if ((value === undefined || value === null || value === "") && field.defaultValue) {
      value = field.defaultValue;
      values[field.variable] = value;
    }
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (field.required) errors.push(`${field.name} (${field.variable}) is required.`);
      continue;
    }

    const strValue = String(value);
    if (!matchesType(field.type, value)) {
      errors.push(`${field.name} must be a ${field.type} value.`);
      continue;
    }

    if (field.minLength !== null && field.minLength !== undefined && strValue.length < field.minLength) {
      errors.push(`${field.name} must be at least ${field.minLength} characters.`);
    }
    if (field.maxLength !== null && field.maxLength !== undefined && strValue.length > field.maxLength) {
      errors.push(`${field.name} must be at most ${field.maxLength} characters.`);
    }
    if (field.minValue !== null && field.minValue !== undefined) {
      const num = Number(value);
      if (!Number.isNaN(num) && num < field.minValue) errors.push(`${field.name} must be at least ${field.minValue}.`);
    }
    if (field.maxValue !== null && field.maxValue !== undefined) {
      const num = Number(value);
      if (!Number.isNaN(num) && num > field.maxValue) errors.push(`${field.name} must be at most ${field.maxValue}.`);
    }
    if (field.validation) {
      try {
        if (!new RegExp(field.validation).test(strValue)) {
          errors.push(`${field.name} does not match the required format.`);
        }
      } catch {
        // invalid regex in config — ignore
      }
    }
    if (field.enumOptions && Array.isArray(field.enumOptions) && field.enumOptions.length > 0) {
      if (!field.enumOptions.includes(strValue)) {
        errors.push(`${field.name} must be one of: ${field.enumOptions.join(", ")}.`);
      }
    }
  }

  return { errors, values };
}

/** Render a string template, substituting {{variable}} placeholders. */
export function renderTemplate(template: string, vars: ResolvedVariables): string {
  return template.replace(VAR_PATTERN, (_m, name: string) => {
    const value = getByPath(vars, name);
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

/** Recursively substitute variables in a JSON-like value (deep template). */
export function substituteRecursive(value: unknown, vars: ResolvedVariables): unknown {
  if (typeof value === "string") return renderTemplate(value, vars);
  if (Array.isArray(value)) return value.map((v) => substituteRecursive(v, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteRecursive(v, vars);
    }
    return out;
  }
  return value;
}

export type BuiltRequest = {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  formData?: Array<[string, string]>;
  contentType?: string;
};

export type ProductConfig = Pick<
  ApiProduct,
  "method" | "baseUrl" | "endpointPath" | "requestBodyType"
> & {
  requestBodyTemplate?: unknown;
  queryParams?: unknown;
  pathParams?: unknown;
  headers?: unknown;
};

/**
 * Build the provider request for a product given the resolved variable map.
 * Applies path/query/header templates and serializes the request body per the
 * configured body type.
 */
export function buildProviderRequest(
  product: ProductConfig,
  vars: ResolvedVariables,
  extraQuery?: string,
): BuiltRequest {
  const method = product.method || "POST";
  const base = product.baseUrl.replace(/\/+$/, "");

  // Path: base + endpointPath + pathParams, then apply template vars.
  let pathTemplate = product.endpointPath || "";
  if (product.pathParams && Array.isArray(product.pathParams)) {
    for (const p of product.pathParams as Array<{ name: string; value: string }>) {
      pathTemplate = pathTemplate.replace(new RegExp(`\\{${p.name}\\}`, "g"), renderTemplate(p.value, vars));
    }
  }
  const path = renderTemplate(pathTemplate, vars);
  const url = new URL(base + (path.startsWith("/") ? path : "/" + path));

  // Query parameters: configured templates + carried-over customer query.
  const queryValues = new URLSearchParams(extraQuery ?? "");
  if (product.queryParams && Array.isArray(product.queryParams)) {
    for (const q of product.queryParams as Array<{ name: string; value: string }>) {
      const rendered = renderTemplate(q.value, vars);
      if (rendered !== "") queryValues.set(q.name, rendered);
    }
  }
  // Allow the provider template query params to be overridden by the customer's.
  url.search = queryValues.toString();

  const headers: Record<string, string> = {};
  if (product.headers && Array.isArray(product.headers)) {
    for (const h of product.headers as Array<{ name: string; value: string }>) {
      const name = h.name.toLowerCase();
      if (name === "host") continue;
      headers[h.name] = renderTemplate(h.value, vars);
    }
  }

  let body: string | undefined;
  let contentType: string | undefined;
  let formData: Array<[string, string]> | undefined;

  switch (product.requestBodyType) {
    case "none":
      body = undefined;
      break;
    case "json":
      if (product.requestBodyTemplate !== null && product.requestBodyTemplate !== undefined) {
        body = JSON.stringify(substituteRecursive(product.requestBodyTemplate, vars));
        contentType = "application/json";
      }
      break;
    case "raw":
      if (typeof product.requestBodyTemplate === "string") {
        body = renderTemplate(product.requestBodyTemplate, vars);
        contentType = headers["content-type"] ?? "text/plain";
      }
      break;
    case "form": {
      const entries: Array<[string, string]> = [];
      if (product.requestBodyTemplate && typeof product.requestBodyTemplate === "object") {
        for (const [k, v] of Object.entries(product.requestBodyTemplate as Record<string, unknown>)) {
          const rendered = substituteRecursive(v, vars);
          entries.push([k, typeof rendered === "object" ? JSON.stringify(rendered) : String(rendered ?? "")]);
        }
      }
      body = undefined;
      formData = entries;
      contentType = "multipart/form-data";
      break;
    }
    case "urlencoded": {
      const params = new URLSearchParams();
      if (product.requestBodyTemplate && typeof product.requestBodyTemplate === "object") {
        for (const [k, v] of Object.entries(product.requestBodyTemplate as Record<string, unknown>)) {
          const rendered = substituteRecursive(v, vars);
          params.set(k, typeof rendered === "object" ? JSON.stringify(rendered) : String(rendered ?? ""));
        }
      }
      body = params.toString();
      contentType = "application/x-www-form-urlencoded";
      break;
    }
  }

  if (contentType && !headers["content-type"]) headers["content-type"] = contentType;

  return { url, method, headers, body, formData, contentType };
}