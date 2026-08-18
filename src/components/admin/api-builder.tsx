"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Universal API Builder (section 2). A multi-step wizard that produces a
// generic, database-driven API product configuration — no per-provider code.

type FieldDraft = {
  name: string;
  variable: string;
  type: string;
  required: boolean;
  sensitive: boolean;
  store: boolean;
  mask: boolean;
  log: boolean;
  returnToCustomer: boolean;
  validation: string;
  minLength: number | null;
  maxLength: number | null;
  defaultValue: string;
  placeholder: string;
  example: string;
  enumOptions: string[];
};

type MappingDraft = {
  providerPath: string;
  customerField: string;
  fieldType: string;
  mask: boolean;
  maskRule: string;
  transform: string;
  template: string;
  placement: string;
  customerPath: string;
  required: boolean;
};

type PricingDraft = {
  customerId: string | null;
  price: number;
  enabled: boolean;
};

export type BuilderProduct = {
  id?: string;
  name: string;
  displayName: string;
  slug: string;
  version: string;
  category: string;
  description: string;
  providerWebsite: string;
  vendorId: string;
  status: string;
  supportsSandbox: boolean;
  supportsLive: boolean;
  method: string;
  baseUrl: string;
  endpointPath: string;
  requestBodyType: string;
  requestBodyTemplate: string;
  queryParams: Array<{ name: string; value: string }>;
  pathParams: Array<{ name: string; value: string }>;
  headers: Array<{ name: string; value: string }>;
  responseMode: string;
  normalizedResponseSchema: string;
  errorMappings: string;
  fallbackEnabled: boolean;
  fallbackRetryCount: number;
  fallbackTimeoutMs: number;
  fallbackVendorIds: string[];
  defaultCost: number;
  defaultPrice: number;
  billingModel: string;
  billOnSuccess: boolean;
  requireConsent: boolean;
  dataRetentionDays: number | null;
  fields: FieldDraft[];
  mappings: MappingDraft[];
  pricingRules: PricingDraft[];
};

type VendorOption = { id: string; name: string; slug: string };

const EMPTY_FIELD: FieldDraft = {
  name: "",
  variable: "",
  type: "text",
  required: false,
  sensitive: false,
  store: false,
  mask: false,
  log: false,
  returnToCustomer: true,
  validation: "",
  minLength: null,
  maxLength: null,
  defaultValue: "",
  placeholder: "",
  example: "",
  enumOptions: [],
};

const EMPTY_MAPPING: MappingDraft = {
  providerPath: "",
  customerField: "",
  fieldType: "string",
  mask: false,
  maskRule: "",
  transform: "none",
  template: "",
  placement: "top",
  customerPath: "",
  required: false,
};

const STEPS = ["Basic", "Endpoint", "Request", "Input Fields", "Response", "Pricing", "Preview"];

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900";
const labelCls = "mb-1 block text-sm font-medium";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function ApiBuilder({
  product,
  vendors,
  customers,
  initialVendorId,
}: {
  product: BuilderProduct | null;
  vendors: VendorOption[];
  customers: Array<{ id: string; email: string }>;
  initialVendorId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<BuilderProduct>(() => {
    if (product) return product;
    return {
      name: "",
      displayName: "",
      slug: "",
      version: "v1",
      category: "",
      description: "",
      providerWebsite: "",
      vendorId: initialVendorId ?? vendors[0]?.id ?? "",
      status: "draft",
      supportsSandbox: true,
      supportsLive: true,
      method: "POST",
      baseUrl: "",
      endpointPath: "/",
      requestBodyType: "json",
      requestBodyTemplate: "{\n  \"key\": \"{{variable}}\"\n}",
      queryParams: [],
      pathParams: [],
      headers: [],
      responseMode: "normalized",
      normalizedResponseSchema: "",
      errorMappings: "[]",
      fallbackEnabled: false,
      fallbackRetryCount: 1,
      fallbackTimeoutMs: 5000,
      fallbackVendorIds: [],
      defaultCost: 0,
      defaultPrice: 0,
      billingModel: "per_request",
      billOnSuccess: true,
      requireConsent: false,
      dataRetentionDays: null,
      fields: [],
      mappings: [],
      pricingRules: [],
    };
  });

  const set = <K extends keyof BuilderProduct>(key: K, value: BuilderProduct[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const finalUrl = useMemo(() => {
    try {
      const base = form.baseUrl.replace(/\/+$/, "");
      const path = form.endpointPath.startsWith("/") ? form.endpointPath : `/${form.endpointPath}`;
      return `${base}${path}`;
    } catch {
      return "";
    }
  }, [form.baseUrl, form.endpointPath]);

  function addField() {
    setForm((f) => ({ ...f, fields: [...f.fields, { ...EMPTY_FIELD }] }));
  }
  function updateField(index: number, patch: Partial<FieldDraft>) {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }
  function removeField(index: number) {
    setForm((f) => ({ ...f, fields: f.fields.filter((_, i) => i !== index) }));
  }

  function addMapping() {
    setForm((f) => ({ ...f, mappings: [...f.mappings, { ...EMPTY_MAPPING }] }));
  }
  function updateMapping(index: number, patch: Partial<MappingDraft>) {
    setForm((f) => ({
      ...f,
      mappings: f.mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  }
  function removeMapping(index: number) {
    setForm((f) => ({ ...f, mappings: f.mappings.filter((_, i) => i !== index) }));
  }

  function setRow<K extends "queryParams" | "pathParams" | "headers">(
    key: K,
    index: number,
    patch: Partial<{ name: string; value: string }>,
  ) {
    setForm((f) => ({
      ...f,
      [key]: (f[key] as Array<{ name: string; value: string }>).map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  async function save(final = false) {
    setError(null);
    setSaving(true);

    let requestBodyTemplate: unknown;
    let normalizedResponseSchema: unknown;
    let errorMappings: unknown;
    try {
      requestBodyTemplate = form.requestBodyTemplate.trim()
        ? JSON.parse(form.requestBodyTemplate)
        : null;
      normalizedResponseSchema = form.normalizedResponseSchema.trim()
        ? JSON.parse(form.normalizedResponseSchema)
        : null;
      errorMappings = form.errorMappings.trim() ? JSON.parse(form.errorMappings) : [];
    } catch {
      setError("Request / response JSON is not valid JSON.");
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name,
      displayName: form.displayName,
      slug: form.slug || slugify(form.displayName || form.name),
      version: form.version,
      category: form.category || null,
      description: form.description || null,
      providerWebsite: form.providerWebsite || null,
      vendorId: form.vendorId,
      status: final ? "published" : form.status || "draft",
      supportsSandbox: form.supportsSandbox,
      supportsLive: form.supportsLive,
      method: form.method,
      baseUrl: form.baseUrl,
      endpointPath: form.endpointPath,
      requestBodyType: form.requestBodyType,
      requestBodyTemplate,
      queryParams: form.queryParams.filter((q) => q.name),
      pathParams: form.pathParams.filter((p) => p.name),
      headers: form.headers.filter((h) => h.name),
      responseMode: form.responseMode,
      normalizedResponseSchema,
      errorMappings,
      fallbackEnabled: form.fallbackEnabled,
      fallbackRetryCount: form.fallbackRetryCount,
      fallbackTimeoutMs: form.fallbackTimeoutMs,
      fallbackVendorIds: form.fallbackVendorIds,
      defaultCost: form.defaultCost,
      defaultPrice: form.defaultPrice,
      billingModel: form.billingModel,
      billOnSuccess: form.billOnSuccess,
      requireConsent: form.requireConsent,
      dataRetentionDays: form.dataRetentionDays,
      fields: form.fields.map((f) => ({
        name: f.name,
        variable: f.variable,
        type: f.type,
        required: f.required,
        sensitive: f.sensitive,
        store: f.store,
        mask: f.mask,
        log: f.log,
        returnToCustomer: f.returnToCustomer,
        validation: f.validation || null,
        minLength: f.minLength,
        maxLength: f.maxLength,
        defaultValue: f.defaultValue || null,
        placeholder: f.placeholder || null,
        example: f.example || null,
        enumOptions: f.type === "select" ? f.enumOptions.filter(Boolean) : [],
      })),
      mappings: form.mappings.map((m) => ({
        providerPath: m.providerPath,
        customerField: m.customerField,
        fieldType: m.fieldType,
        mask: m.mask,
        maskRule: m.maskRule || null,
        transform: m.transform,
        template: m.template || null,
        placement: m.placement,
        customerPath: m.customerPath || null,
        required: m.required,
      })),
      pricingRules: form.pricingRules.map((p) => ({
        customerId: p.customerId,
        price: p.price,
        enabled: p.enabled,
      })),
    };

    try {
      const url = form.id ? `/api/admin/api-products/${form.id}` : "/api/admin/api-products";
      const res = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const details = data?.details as Record<string, unknown> | undefined;
        const detailMsg = details ? Object.entries(details).map(([, v]) => JSON.stringify(v)).join(" ") : "";
        setError(data?.error ?? "Validation failed" + (detailMsg ? `: ${detailMsg}` : ""));
        return;
      }
      router.push("/admin/apis");
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    } finally {
      setSaving(false);
    }
  }

  const canContinue = step > 0;
  const preview = useMemo(
    () => ({
      slug: form.slug || slugify(form.displayName || form.name) || "api-slug",
      url: `/api/v1/${form.slug || slugify(form.displayName || form.name) || "api-slug"}`,
      method: form.method,
      fields: form.fields.filter((f) => f.variable),
      mappings: form.mappings.filter((m) => m.customerField),
    }),
    [form],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              step === i
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* STEP 1 — BASIC */}
      {step === 0 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold">Basic information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>API name (internal)</label>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Aadhaar Verification"
              />
            </div>
            <div>
              <label className={labelCls}>Display name (customer-facing)</label>
              <input
                className={inputCls}
                value={form.displayName}
                onChange={(e) => {
                  const displayName = e.target.value;
                  setForm((f) => ({
                    ...f,
                    displayName,
                    slug: f.slug || slugify(displayName),
                  }));
                }}
                placeholder="e.g. Aadhaar Verification"
              />
            </div>
            <div>
              <label className={labelCls}>Slug (gateway route)</label>
              <input
                className={`${inputCls} font-mono`}
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
                placeholder="aadhaar-verification"
              />
              <p className="mt-1 text-xs text-gray-500">
                Customers call <code>/api/v1/&#123;slug&#125;</code>
              </p>
            </div>
            <div>
              <label className={labelCls}>Version</label>
              <input
                className={`${inputCls} font-mono`}
                value={form.version}
                onChange={(e) => set("version", e.target.value)}
                placeholder="v1"
              />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input
                className={inputCls}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Identity Verification"
              />
            </div>
            <div>
              <label className={labelCls}>Provider</label>
              <select
                className={inputCls}
                value={form.vendorId}
                onChange={(e) => set("vendorId", e.target.value)}
              >
                {vendors.length === 0 && <option value="">No providers — add one in Providers first</option>}
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Verify Aadhaar using an authorized provider API."
              />
            </div>
            <div>
              <label className={labelCls}>Provider website</label>
              <input
                className={inputCls}
                value={form.providerWebsite}
                onChange={(e) => set("providerWebsite", e.target.value)}
                placeholder="https://provider.com"
              />
            </div>
            <div className="flex items-end gap-6 pb-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.supportsSandbox}
                  onChange={(e) => set("supportsSandbox", e.target.checked)}
                />
                Sandbox
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.supportsLive}
                  onChange={(e) => set("supportsLive", e.target.checked)}
                />
                Live
              </label>
            </div>
          </div>
        </section>
      )}

      {/* STEP 2 — PROVIDER ENDPOINT */}
      {step === 1 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold">Provider endpoint</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>HTTP method</label>
              <select
                className={inputCls}
                value={form.method}
                onChange={(e) => set("method", e.target.value)}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Base URL</label>
              <input
                className={inputCls}
                value={form.baseUrl}
                onChange={(e) => set("baseUrl", e.target.value)}
                placeholder="https://apis.provider.com"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Endpoint path</label>
              <input
                className={`${inputCls} font-mono`}
                value={form.endpointPath}
                onChange={(e) => set("endpointPath", e.target.value)}
                placeholder="/apiProduct/aadhaar-verify"
              />
              <p className="mt-1 text-xs text-gray-500">
                Final URL: <span className="font-mono">{finalUrl || "—"}</span>
              </p>
            </div>
          </div>

          <KVEditor
            title="Query parameters"
            rows={form.queryParams}
            hint="Values may contain {{variable}} placeholders"
            onChange={(rows) => set("queryParams", rows)}
            setRow={(i, patch) => setRow("queryParams", i, patch)}
          />
          <KVEditor
            title="Path parameters"
            rows={form.pathParams}
            hint="Replaces {name} in the endpoint path"
            onChange={(rows) => set("pathParams", rows)}
            setRow={(i, patch) => setRow("pathParams", i, patch)}
          />
          <KVEditor
            title="Extra request headers"
            rows={form.headers}
            hint="Static headers for this product (auth headers are configured on the Provider)"
            onChange={(rows) => set("headers", rows)}
            setRow={(i, patch) => setRow("headers", i, patch)}
          />
        </section>
      )}

      {/* STEP 3 — REQUEST BUILDER */}
      {step === 2 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold">Request builder</h2>
          <div>
            <label className={labelCls}>Body type</label>
            <select
              className={inputCls}
              value={form.requestBodyType}
              onChange={(e) => set("requestBodyType", e.target.value)}
            >
              <option value="json">JSON</option>
              <option value="form">Form data (multipart)</option>
              <option value="urlencoded">x-www-form-urlencoded</option>
              <option value="raw">Raw text</option>
              <option value="none">No body</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Request body template{" "}
              <span className="font-normal text-gray-400">
                — use <code>{`{{variable}}`}</code> for dynamic values
              </span>
            </label>
            <textarea
              className={`${inputCls} font-mono`}
              rows={8}
              spellCheck={false}
              value={form.requestBodyTemplate}
              onChange={(e) => set("requestBodyTemplate", e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Example: {"{\"documentData\": {\"aadhaar_number\": \"{{aadhaar_number}}\"}}"}
            </p>
          </div>
        </section>
      )}

      {/* STEP 4 — INPUT FIELD BUILDER */}
      {step === 3 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Input fields</h2>
            <button
              type="button"
              onClick={addField}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add field
            </button>
          </div>
          <p className="text-sm text-gray-500">
            Each API gets its own schema. Sensitive fields are masked and never
            stored or logged unless explicitly configured.
          </p>
          {form.fields.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              No input fields yet — add the fields your customers will send.
            </p>
          )}
          {form.fields.map((field, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Field {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Display name</label>
                  <input
                    className={inputCls}
                    value={field.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    placeholder="Aadhaar Number"
                  />
                </div>
                <div>
                  <label className={labelCls}>Variable</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={field.variable}
                    onChange={(e) =>
                      updateField(i, {
                        variable: e.target.value.replace(/[^a-zA-Z0-9_.\-]/g, ""),
                      })
                    }
                    placeholder="aadhaar_number"
                  />
                </div>
                <div>
                  <label className={labelCls}>Type</label>
                  <select
                    className={inputCls}
                    value={field.type}
                    onChange={(e) => updateField(i, { type: e.target.value })}
                  >
                    {["text", "number", "email", "phone", "date", "datetime", "boolean", "select", "textarea", "file", "json"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Validation (regex)</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={field.validation}
                    onChange={(e) => updateField(i, { validation: e.target.value })}
                    placeholder="^[0-9]{12}$"
                  />
                </div>
                <div>
                  <label className={labelCls}>Min length</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={field.minLength ?? ""}
                    onChange={(e) =>
                      updateField(i, { minLength: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Max length</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={field.maxLength ?? ""}
                    onChange={(e) =>
                      updateField(i, { maxLength: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Default value</label>
                  <input
                    className={inputCls}
                    value={field.defaultValue}
                    onChange={(e) => updateField(i, { defaultValue: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Placeholder</label>
                  <input
                    className={inputCls}
                    value={field.placeholder}
                    onChange={(e) => updateField(i, { placeholder: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Example</label>
                  <input
                    className={inputCls}
                    value={field.example}
                    onChange={(e) => updateField(i, { example: e.target.value })}
                  />
                </div>
                {field.type === "select" && (
                  <div className="sm:col-span-3">
                    <label className={labelCls}>Enum options (comma separated)</label>
                    <input
                      className={inputCls}
                      value={field.enumOptions.join(", ")}
                      onChange={(e) =>
                        updateField(i, { enumOptions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                      }
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-5 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.sensitive}
                    onChange={(e) => updateField(i, { sensitive: e.target.checked })}
                  />
                  Sensitive
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.mask}
                    onChange={(e) => updateField(i, { mask: e.target.checked })}
                  />
                  Mask
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.store}
                    onChange={(e) => updateField(i, { store: e.target.checked })}
                  />
                  Store
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.log}
                    onChange={(e) => updateField(i, { log: e.target.checked })}
                  />
                  Log
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={field.returnToCustomer}
                    onChange={(e) => updateField(i, { returnToCustomer: e.target.checked })}
                  />
                  Return to customer
                </label>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* STEP 5 — RESPONSE */}
      {step === 4 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Response mapping</h2>
            <button
              type="button"
              onClick={addMapping}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add mapping
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Response mode</label>
              <select
                className={inputCls}
                value={form.responseMode}
                onChange={(e) => set("responseMode", e.target.value)}
              >
                <option value="normalized">Normalized (standardized schema)</option>
                <option value="raw">Raw (provider JSON, privacy-filtered)</option>
              </select>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Map provider response fields to customer-facing fields, e.g.{" "}
            <code>data.full_name</code> → <code>name</code>.
          </p>
          {form.mappings.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              No mappings yet. In Raw mode this step is optional.
            </p>
          )}
          {form.mappings.map((m, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mapping {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeMapping(i)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Provider path</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={m.providerPath}
                    onChange={(e) => updateMapping(i, { providerPath: e.target.value })}
                    placeholder="data.full_name"
                  />
                </div>
                <div>
                  <label className={labelCls}>Customer field</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={m.customerField}
                    onChange={(e) => updateMapping(i, { customerField: e.target.value })}
                    placeholder="name"
                  />
                </div>
                <div>
                  <label className={labelCls}>Transform</label>
                  <select
                    className={inputCls}
                    value={m.transform}
                    onChange={(e) => updateMapping(i, { transform: e.target.value })}
                  >
                    <option value="none">None</option>
                    <option value="uppercase">Uppercase</option>
                    <option value="lowercase">Lowercase</option>
                    <option value="trim">Trim</option>
                    <option value="boolean_to_status">Boolean → status</option>
                    <option value="template">Template</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Masking</label>
                  <select
                    className={inputCls}
                    value={m.mask ? m.maskRule || "partial" : "none"}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateMapping(i, v === "none" ? { mask: false, maskRule: "" } : { mask: true, maskRule: v });
                    }}
                  >
                    <option value="none">No mask</option>
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Custom mask rule (optional)</label>
                  <input
                    className={`${inputCls} font-mono`}
                    value={m.mask ? m.maskRule && !["partial", "full", "hidden"].includes(m.maskRule) ? m.maskRule : "" : ""}
                    onChange={(e) => updateMapping(i, { mask: true, maskRule: e.target.value })}
                    placeholder="^(.{4}).*(.{4})$"
                  />
                </div>
                <div>
                  <label className={labelCls}>Placement</label>
                  <select
                    className={inputCls}
                    value={m.placement}
                    onChange={(e) => updateMapping(i, { placement: e.target.value })}
                  >
                    <option value="top">Top level</option>
                    <option value="nested">Nested path</option>
                  </select>
                </div>
              </div>
            </div>
          ))}

          <div>
            <label className={labelCls}>Normalized response schema (optional)</label>
            <textarea
              className={`${inputCls} font-mono`}
              rows={5}
              spellCheck={false}
              value={form.normalizedResponseSchema}
              onChange={(e) => set("normalizedResponseSchema", e.target.value)}
              placeholder={"{\n  \"verification_status\": \"{{verification_status}}\"\n}"}
            />
          </div>
          <div>
            <label className={labelCls}>Error mappings (optional JSON)</label>
            <textarea
              className={`${inputCls} font-mono`}
              rows={4}
              spellCheck={false}
              value={form.errorMappings}
              onChange={(e) => set("errorMappings", e.target.value)}
              placeholder='[{"match":{"status":false},"code":"INVALID_DOCUMENT","message":"The document could not be verified."}]'
            />
          </div>
        </section>
      )}

      {/* STEP 6 — PRICING & PRIVACY */}
      {step === 5 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold">Pricing & fallback</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Provider cost (₹)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.defaultCost}
                onChange={(e) => set("defaultCost", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>Customer price (₹)</label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={form.defaultPrice}
                onChange={(e) => set("defaultPrice", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>Billing model</label>
              <select
                className={inputCls}
                value={form.billingModel}
                onChange={(e) => set("billingModel", e.target.value)}
              >
                <option value="per_request">Per request</option>
                <option value="per_success">Per successful request</option>
                <option value="per_failure">Per failed request</option>
                <option value="subscription">Subscription</option>
                <option value="credits">Package credits</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Customer-specific pricing</span>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    pricingRules: [
                      ...f.pricingRules,
                      { customerId: customers[0]?.id ?? null, price: 0, enabled: true },
                    ],
                  }))
                }
                className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                + Add rule
              </button>
            </div>
            {form.pricingRules.length === 0 && (
              <p className="text-xs text-gray-400">Default pricing applies to everyone.</p>
            )}
            {form.pricingRules.map((rule, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-3">
                <select
                  className={`${inputCls} max-w-xs`}
                  value={rule.customerId ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pricingRules: f.pricingRules.map((r, j) =>
                        j === i ? { ...r, customerId: e.target.value || null } : r,
                      ),
                    }))
                  }
                >
                  <option value="">All customers (default)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.email}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} max-w-[120px]`}
                  value={rule.price}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pricingRules: f.pricingRules.map((r, j) =>
                        j === i ? { ...r, price: Number(e.target.value) } : r,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      pricingRules: f.pricingRules.filter((_, j) => j !== i),
                    }))
                  }
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={form.fallbackEnabled}
                onChange={(e) => set("fallbackEnabled", e.target.checked)}
              />
              Fallback providers (retry with another provider on timeout / 5xx)
            </label>
            {form.fallbackEnabled && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Timeout (ms)</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.fallbackTimeoutMs}
                    onChange={(e) => set("fallbackTimeoutMs", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Retry count</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.fallbackRetryCount}
                    onChange={(e) => set("fallbackRetryCount", Number(e.target.value))}
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className={labelCls}>Fallback providers</label>
                  <select
                    className={inputCls}
                    value={form.fallbackVendorIds.join(",")}
                    onChange={(e) => set("fallbackVendorIds", e.target.value ? e.target.value.split(",") : [])}
                  >
                    <option value="">None</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 p-4 text-sm dark:border-gray-800">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={form.requireConsent}
                onChange={(e) => set("requireConsent", e.target.checked)}
              />
              Require consent/authorization metadata for this API
            </label>
            <div className="mt-2 text-xs text-gray-500">
              For identity verification APIs, consent metadata may be required by
              the provider. Enable to note this in the documentation and audit logs.
            </div>
          </div>
        </section>
      )}

      {/* STEP 7 — PREVIEW */}
      {step === 6 && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-lg font-semibold">Preview</h2>
          <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-950">
            <div className="flex gap-2">
              <span className="font-medium">Customer endpoint:</span>
              <code className="font-mono">{preview.method} /api/v1/{preview.slug}</code>
            </div>
            <div className="flex gap-2">
              <span className="font-medium">Provider endpoint:</span>
              <code className="font-mono">{form.method} {finalUrl || "—"}</code>
            </div>
            <div className="flex gap-2">
              <span className="font-medium">Pricing:</span>
              <span>₹{form.defaultPrice}/request (cost ₹{form.defaultCost})</span>
            </div>
            {preview.fields.length > 0 && (
              <div className="flex gap-2">
                <span className="font-medium">Input:</span>
                <span>{preview.fields.map((f) => f.variable).join(", ")}</span>
              </div>
            )}
            {preview.mappings.length > 0 && (
              <div className="flex gap-2">
                <span className="font-medium">Output:</span>
                <span>{preview.mappings.map((m) => m.customerField).join(", ")}</span>
              </div>
            )}
          </div>
          {form.id && (
            <a
              href={`/admin/apis/${form.id}/test`}
              className="inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Test API →
            </a>
          )}
        </section>
      )}

      {/* FOOTER ACTIONS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
        <div className="flex gap-3">
          {canContinue && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Continue →
          </button>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => save(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Publish API"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KVEditor({
  title,
  rows,
  hint,
  onChange,
  setRow,
}: {
  title: string;
  rows: Array<{ name: string; value: string }>;
  hint: string;
  onChange: (rows: Array<{ name: string; value: string }>) => void;
  setRow: (i: number, patch: Partial<{ name: string; value: string }>) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={() => onChange([...rows, { name: "", value: "" }])}
          className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          + Add row
        </button>
      </div>
      <p className="mb-2 text-xs text-gray-400">{hint}</p>
      {rows.length === 0 && <p className="text-xs text-gray-400">None.</p>}
      {rows.map((row, i) => (
        <div key={i} className="mb-2 flex gap-2">
          <input
            className={`${inputCls} max-w-[220px] font-mono`}
            value={row.name}
            onChange={(e) => setRow(i, { name: e.target.value })}
            placeholder="name"
          />
          <input
            className={`${inputCls} font-mono`}
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
            placeholder="value (may use {{variable}})"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0 text-xs font-medium text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}