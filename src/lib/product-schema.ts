import { z } from "zod";

// Validation schemas for the universal API builder (admin). Money values are
// accepted in rupees (decimal) and converted to paise before storage.

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const bodyTypeSchema = z.enum(["json", "form", "urlencoded", "raw", "none"]);
const fieldTypeSchema = z.enum(["text", "number", "email", "phone", "date", "datetime", "boolean", "select", "textarea", "file", "json"]);
const transformSchema = z.enum(["none", "uppercase", "lowercase", "trim", "boolean_to_status", "template"]);
const placementSchema = z.enum(["top", "nested"]);
const billingModelSchema = z.enum(["per_request", "per_success", "per_failure", "subscription", "credits"]);

const keyValueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  value: z.string().max(5000).default(""),
});

export const apiFieldSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  variable: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_.\[\]-]+$/, "Variable must contain letters, numbers, dots, underscores, brackets or hyphens"),
  type: fieldTypeSchema.default("text"),
  description: z.string().max(500).optional().default(""),
  required: z.boolean().default(false),
  sensitive: z.boolean().default(false),
  store: z.boolean().default(false),
  mask: z.boolean().default(false),
  log: z.boolean().default(false),
  returnToCustomer: z.boolean().default(true),
  validation: z.string().max(500).optional().nullable().default(null),
  minLength: z.coerce.number().int().min(0).max(10000).optional().nullable().default(null),
  maxLength: z.coerce.number().int().min(0).max(100000).optional().nullable().default(null),
  minValue: z.coerce.number().optional().nullable().default(null),
  maxValue: z.coerce.number().optional().nullable().default(null),
  defaultValue: z.string().max(5000).optional().nullable().default(null),
  placeholder: z.string().max(200).optional().nullable().default(null),
  example: z.string().max(5000).optional().nullable().default(null),
  enumOptions: z.array(z.string()).optional().default([]),
});

export const responseMappingSchema = z.object({
  id: z.string().optional(),
  providerPath: z.string().trim().min(1).max(500),
  customerField: z.string().trim().min(1).max(200),
  fieldType: z.enum(["string", "number", "boolean", "array", "object", "any"]).default("string"),
  mask: z.boolean().default(false),
  maskRule: z.string().max(200).optional().nullable().default(null),
  transform: transformSchema.default("none"),
  template: z.string().max(2000).optional().nullable().default(null),
  placement: placementSchema.default("top"),
  customerPath: z.string().max(200).optional().nullable().default(null),
  required: z.boolean().default(false),
});

const pricingRuleSchema = z.object({
  customerId: z.string().nullable().optional().default(null),
  price: z.coerce.number().min(0),
  enabled: z.boolean().default(true),
});

export const apiProductCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  version: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^v\d+$/, "Version must look like v1, v2, …")
    .default("v1"),
  category: z.string().max(100).optional().nullable().default(null),
  description: z.string().max(2000).optional().nullable().default(null),
  logo: z.string().max(500).optional().nullable().default(null),
  providerWebsite: z.string().url().optional().nullable().default(null),
  vendorId: z.string().min(1, "Provider is required"),
  status: z.enum(["draft", "published", "disabled"]).default("draft"),
  supportsSandbox: z.boolean().default(true),
  supportsLive: z.boolean().default(true),

  method: httpMethodSchema.default("POST"),
  baseUrl: z.string().url("Base URL must be a full URL"),
  endpointPath: z.string().trim().min(1).max(2000).default("/"),
  requestBodyType: bodyTypeSchema.default("json"),
  requestBodyTemplate: z.unknown().optional().nullable().default(null),
  queryParams: z.array(keyValueSchema).default([]),
  pathParams: z.array(keyValueSchema).default([]),
  headers: z.array(keyValueSchema).default([]),

  responseMode: z.enum(["raw", "normalized"]).default("raw"),
  normalizedResponseSchema: z.unknown().optional().nullable().default(null),
  errorMappings: z.array(z.unknown()).default([]),

  fallbackEnabled: z.boolean().default(false),
  fallbackRetryCount: z.coerce.number().int().min(0).max(10).default(1),
  fallbackTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(5000),
  fallbackVendorIds: z.array(z.string()).default([]),

  // Pricing in rupees (converted to paise in the handler).
  defaultCost: z.coerce.number().min(0).default(0),
  defaultPrice: z.coerce.number().min(0).default(0),
  billingModel: billingModelSchema.default("per_request"),
  billOnSuccess: z.boolean().default(true),

  requireConsent: z.boolean().default(false),
  dataRetentionDays: z.coerce.number().int().min(0).max(3650).optional().nullable().default(null),
  privacyConfig: z.unknown().optional().nullable().default(null),

  fields: z.array(apiFieldSchema).default([]),
  mappings: z.array(responseMappingSchema).default([]),
  pricingRules: z.array(pricingRuleSchema).default([]),
});

export const apiProductUpdateSchema = apiProductCreateSchema.partial().extend({
  // allow explicit status transitions
  status: z.enum(["draft", "published", "disabled"]).optional(),
});

export type ApiProductInput = z.infer<typeof apiProductCreateSchema>;