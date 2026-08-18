"use client";

import { useState } from "react";

type Field = {
  variable: string;
  name: string;
  type: string;
  required: boolean;
  example: string | null;
};

type Result = {
  status: number;
  ok: boolean;
  timeMs: number;
  body: string;
};

const STORAGE_KEY = "apiplayground.key";

export function ProductPlayground({
  slug,
  method,
  priceLabel,
  liveAllowed,
  supportsSandbox,
  fields,
}: {
  slug: string;
  method: string;
  priceLabel: string;
  liveAllowed: boolean;
  supportsSandbox: boolean;
  fields: Field[];
}) {
  const [key, setKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.variable, f.example ?? ""])),
  );
  const [live, setLive] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Paste your API key first (from the Dashboard).");
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // storage unavailable — fine
    }

    const missing = fields.filter((f) => f.required && !String(values[f.variable] ?? "").trim());
    if (missing.length > 0) {
      setError(`Missing required field${missing.length > 1 ? "s" : ""}: ${missing.map((f) => f.variable).join(", ")}`);
      return;
    }

    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = String(values[f.variable] ?? "");
      if (!raw && !f.required) continue;
      body[f.variable] = f.type === "number" ? Number(raw) : f.type === "boolean" ? raw === "true" : raw;
    }

    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch(`/api/v1/${slug}`, {
        method,
        headers: {
          Authorization: `Bearer ${trimmed}`,
          "X-Environment": live ? "live" : "sandbox",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      setResult({
        status: res.status,
        ok: res.ok,
        timeMs: Math.round(performance.now() - started),
        body: text,
      });
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        timeMs: Math.round(performance.now() - started),
        body: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Key + mode */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <label htmlFor="pg-key" className="mb-1 block text-sm font-medium">
            API key
          </label>
          <div className="flex gap-2">
            <input
              id="pg-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk_test_…"
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          {supportsSandbox && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Environment</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLive(false)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-medium ${
                    !live
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setLive(true)}
                  disabled={!liveAllowed}
                  className={`rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    live
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  Live
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {live ? "Live requests hit real provider systems and are billed." : `Sandbox never touches real systems. ${priceLabel}/request in sandbox.`}
              </p>
            </div>
          )}
        </div>

        {/* Fields */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-3 text-sm font-medium">Request body</p>
          <div className="space-y-3">
            {fields.length === 0 && (
              <p className="text-sm text-gray-500">No input fields — just send the request.</p>
            )}
            {fields.map((f) => (
              <div key={f.variable}>
                <label htmlFor={`pg-${f.variable}`} className="mb-1 block text-xs font-medium">
                  <code className="font-mono">{f.variable}</code>
                  <span className="text-gray-400"> · {f.name}</span>
                  {f.required && <span className="ml-1 text-red-500">*</span>}
                </label>
                {f.type === "boolean" ? (
                  <select
                    id={`pg-${f.variable}`}
                    value={values[f.variable] ?? "true"}
                    onChange={(e) => setValues({ ...values, [f.variable]: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    id={`pg-${f.variable}`}
                    value={values[f.variable] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.variable]: e.target.value })}
                    placeholder={f.example ?? f.variable}
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Calling provider…" : `Send ${method} request`}
          </button>
        </div>
      </div>

      {/* Response */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <p className="mb-3 text-sm font-medium">Response</p>
        {!result ? (
          <p className="text-sm text-gray-400">Send a request to see the normalized response here.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  result.status === 0
                    ? "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    : result.ok
                      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {result.status === 0 ? "no response" : result.status}
              </span>
              {result.status > 0 && <span className="text-xs text-gray-400">{result.timeMs} ms</span>}
            </div>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-gray-950">
              {result.body}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}