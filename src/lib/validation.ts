import { z } from "zod";

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
});
