"use client";

import { useState } from "react";

type TesterResult = {
  ok: boolean;
  request_id: string;
  request: { url: string; method: string; headers: Record<string, string>; body: unknown };
  provider: { status: number; timeMs: number; raw: unknown } | null;
  response: unknown;
  human: Array<{ label: string; value: string; sensitive?: boolean }>;
  errors: string[];
  mode: string;
};

type FieldDef = {
  variable: string;
  name: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  example: string | null;
  enumOptions: string[] | null;
  sensitive: boolean;
};

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900";

export function ApiTester({
  productId,
  fields,
  method,
}: {
  productId: string;
  fields: FieldDef[];
  method: string;
}) {
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TesterResult | null>(null);

  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = values[field.variable] ?? "";
        if (raw === "") continue;
        if (field.type === "number") body[field.variable] = Number(raw);
        else if (field.type === "boolean") body[field.variable] = raw === "true" || raw === "1";
        else if (field.type === "json") {
          try {
            body[field.variable] = JSON.parse(raw);
          } catch {
            body[field.variable] = raw;
          }
        } else body[field.variable] = raw;
      }
      const res = await fetch(`/api/admin/api-products/${productId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.result) {
        setResult({
          ok: false,
          request_id: "",
          request: { url: "", method, headers: {}, body: null },
          provider: null,
          response: null,
          human: [],
          errors: [data?.error ?? "Test failed."],
          mode,
        });
        return;
      }
      setResult(data.result);
    } catch {
      setResult({
        ok: false,
        request_id: "",
        request: { url: "", method, headers: {}, body: null },
        provider: null,
        response: null,
        human: [],
        errors: ["Could not reach the server."],
        mode,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Test API</h2>
          <select
            className={inputCls}
            style={{ maxWidth: 160 }}
            value={mode}
            onChange={(e) => setMode(e.target.value as "sandbox" | "live")}
          >
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          The form below is generated from this API&apos;s configured input
          fields. Provider secrets are decrypted server-side and never shown.
        </p>

        <div className="mt-4 space-y-4">
          {fields.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400">
              No input fields configured for this API yet.
            </p>
          )}
          {fields.map((field) => (
            <div key={field.variable}>
              <label className="mb-1 block text-sm font-medium">
                {field.name}
                {field.required && <span className="text-red-500"> *</span>}
                {field.sensitive && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    sensitive
                  </span>
                )}
              </label>
              {field.type === "select" && field.enumOptions && field.enumOptions.length > 0 ? (
                <select
                  className={inputCls}
                  value={values[field.variable] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.variable]: e.target.value }))}
                >
                  <option value="">—</option>
                  {field.enumOptions.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  className={inputCls}
                  value={values[field.variable] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.variable]: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  className={inputCls}
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : "text"}
                  value={values[field.variable] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.variable]: e.target.value }))}
                  placeholder={field.placeholder ?? field.example ?? ""}
                />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={test}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Testing…" : "Test API"}
          </button>
        </div>
      </section>

      {result && (
        <section className="space-y-4">
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {result.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Request */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-2 text-sm font-semibold">Request</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex gap-2">
                  <span className="shrink-0 text-gray-400">URL:</span>
                  <code className="break-all font-mono">{result.request.url || "—"}</code>
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 text-gray-400">Method:</span>
                  <code className="font-mono">{result.request.method}</code>
                </div>
                <div className="flex gap-2">
                  <span className="shrink-0 text-gray-400">Request ID:</span>
                  <code className="font-mono">{result.request_id || "—"}</code>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs text-gray-400">Headers (secrets masked)</div>
                <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-gray-950">
                  {Object.entries(result.request.headers).length === 0
                    ? "(no headers)"
                    : Object.entries(result.request.headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")}
                </pre>
              </div>
              {result.request.body !== null && result.request.body !== undefined && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-gray-400">Body</div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-gray-950">
                    {typeof result.request.body === "string"
                      ? result.request.body
                      : JSON.stringify(result.request.body, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Provider + response */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-2 text-sm font-semibold">Response</h3>
              {result.provider && (
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      result.provider.status === 0
                        ? "bg-gray-200 text-gray-600"
                        : result.provider.status < 300
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    }`}
                  >
                    {result.provider.status === 0 ? "no response" : `HTTP ${result.provider.status}`}
                  </span>
                  <span className="text-gray-400">{result.provider.timeMs} ms</span>
                  <span className="text-gray-400">{result.mode}</span>
                </div>
              )}
              {result.response !== null && (
                <pre className="max-h-72 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-gray-950">
                  {JSON.stringify(result.response, null, 2)}
                </pre>
              )}
            </div>
          </div>

          {/* Human-readable */}
          {result.human.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold">Normal view</h3>
              <div className="space-y-2 text-sm">
                {result.human.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 dark:border-gray-800">
                    <span className="text-gray-500">{row.label}</span>
                    <span className={`font-mono ${row.sensitive ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}