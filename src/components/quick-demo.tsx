"use client";

import { useState } from "react";
import { quickDemoAction, type QuickDemoResult } from "@/lib/demo-actions";

export function QuickDemo({
  onBrandedKey,
}: {
  onBrandedKey: (key: string) => void;
}) {
  const [vendorKey, setVendorKey] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Extract<QuickDemoResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await quickDemoAction(new FormData(event.currentTarget));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res);
    onBrandedKey(res.apiKey);
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6">
      <div className="rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-sm dark:border-blue-900 dark:bg-gray-900 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
            SANDBOX TEST — nothing real is sent or billed
          </span>
          <h2 className="text-xl font-bold">Your vendor key becomes your brand</h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Step 1 — paste any vendor&apos;s API key below. Step 2 — you get your
          own branded key. Step 3 — every function of that vendor works through
          your key, under your name.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="quick-vendor-key" className="mb-1 block text-sm font-medium">
              1 · Paste the vendor&apos;s API key
            </label>
            <input
              id="quick-vendor-key"
              name="vendorKey"
              value={vendorKey}
              onChange={(e) => setVendorKey(e.target.value)}
              placeholder="paste the key the other company gave you"
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          <div>
            <label htmlFor="quick-vendor-name" className="mb-1 block text-sm font-medium">
              Your brand name for it <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="quick-vendor-name"
              name="vendorName"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. MyBrand SMS"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "2 · Create my branded key"}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              2 · Your branded key — shown once, just like a real customer gets
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-sm dark:bg-gray-900">
                {result.apiKey}
              </code>
              <button
                type="button"
                onClick={copy}
                className="rounded-lg border border-green-300 px-3 py-2 text-sm font-medium hover:bg-green-100 dark:border-green-800 dark:hover:bg-green-900"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="mt-3 text-xs text-green-700 dark:text-green-400">
              The vendor&apos;s key is now encrypted in your vault (never shown
              again). Scroll down and try any function of{" "}
              <strong>{result.vendorName}</strong> with your branded key — it
              already works, in sandbox.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
