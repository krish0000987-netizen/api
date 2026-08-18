import { z } from "zod";

export const authTypeSchema = z.enum(["none", "bearer", "api_key", "basic", "custom_header", "query", "oauth2"]);

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // URL slug for the gateway, e.g. "sms" -> /api/v1/sms/...
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens"),
  sandboxEndpoint: z.string().url("Sandbox endpoint must be a full URL"),
  sandboxKey: z.string().trim().min(1, "Sandbox key is required"),
  liveEndpoint: z.string().url("Live endpoint must be a full URL"),
  liveKey: z.string().trim().min(1, "Live key is required"),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  enabled: z.boolean().default(true),
  // ---- Configurable authentication (section 28) ----
  authType: authTypeSchema.default("bearer"),
  authHeaderName: z.string().trim().max(200).optional().nullable().default(null),
  authQueryParam: z.string().trim().max(200).optional().nullable().default(null),
  authBasic: z
    .object({
      username: z.string().trim().min(1).max(500),
      password: z.string().trim().max(500),
    })
    .optional()
    .nullable()
    .default(null),
  authExtraHeaders: z
    .array(z.object({ name: z.string().trim().min(1).max(200), value: z.string().max(5000), isSecret: z.boolean().default(true) }))
    .optional()
    .default([]),
  authOAuth: z
    .object({
      tokenUrl: z.string().url().optional().nullable().default(null),
      clientId: z.string().max(500).optional().nullable().default(null),
      clientSecret: z.string().max(500).optional().nullable().default(null),
      scope: z.string().max(500).optional().nullable().default(null),
      grantType: z.string().max(100).optional().nullable().default("client_credentials"),
    })
    .optional()
    .nullable()
    .default(null),
});

// All fields optional: on edit, blank key fields keep the existing encrypted
// key untouched.
export const vendorUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens")
    .optional(),
  sandboxEndpoint: z.string().url("Sandbox endpoint must be a full URL").optional(),
  sandboxKey: z.string().trim().min(1).optional(),
  liveEndpoint: z.string().url("Live endpoint must be a full URL").optional(),
  liveKey: z.string().trim().min(1).optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  authType: authTypeSchema.optional(),
  authHeaderName: z.string().trim().max(200).optional().nullable(),
  authQueryParam: z.string().trim().max(200).optional().nullable(),
  authBasic: z
    .object({
      username: z.string().trim().max(500),
      password: z.string().trim().max(500),
    })
    .optional()
    .nullable(),
  authExtraHeaders: z
    .array(z.object({ name: z.string().trim().min(1).max(200), value: z.string().max(5000), isSecret: z.boolean().default(true) }))
    .optional(),
  authOAuth: z
    .object({
      tokenUrl: z.string().url().optional().nullable(),
      clientId: z.string().max(500).optional().nullable(),
      clientSecret: z.string().max(500).optional().nullable(),
      scope: z.string().max(500).optional().nullable(),
      grantType: z.string().max(100).optional().nullable(),
    })
    .optional()
    .nullable(),
});
