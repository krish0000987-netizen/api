"use client";

import { useState } from "react";

type Result = {
  status: number;
  ok: boolean;
  timeMs: number;
  headers: Array<[string, string]>;
  body: string;
};

const DEFAULT_BODY = JSON.stringify(
  { to: "+15550001111", text: "Hello from the playground" },
  null,
  2,
);

export function ApiPlayground({
  demoKey,
  demoEmail,
  demoPassword,
  initialKey = "",
  initialPath = "sms/messages",
  examples = [],
}: {
  demoKey: string;
  demoEmail: string;
  demoPassword: string;
  initialKey?: string;
  initialPath?: string;
  examples?: string[];
}) {
  const [key, setKey] = useState(initialKey);
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState(initialPath);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = key.trim();
    if (!trimmed) {
      setResult({
        status: 0,
        ok: false,
        timeMs: 0,
        headers: [],
        body: "Paste your API key first — or click “Use demo key”.",
      });
      return;
    }
    setBusy(true);
    const started = performance.now();
    const cleanPath = path.trim().replace(/^\/+/, "").replace(/^api\/v1\//, "");
    try {
      const res = await fetch(`/api/v1/${cleanPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${trimmed}`,
          ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        },
        body: method === "GET" ? undefined : body || undefined,
      });
      const text = await res.text();
      setResult({
        status: res.status,
        ok: res.ok,
        timeMs: Math.round(performance.now() - started),
        headers: Array.from(res.headers.entries()),
        body: text,
      });
    } catch (error) {
      setResult({
        status: 0,
        ok: false,
        timeMs: Math.round(performance.now() - started),
        headers: [],
        body: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-24">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
        <h2 className="text-xl font-bold">Try it — paste your API key</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No signup needed. Your key identifies you, the gateway decrypts the
          right vendor key server-side, forwards the request, and returns the
          response under our brand — vendor-identifying headers are stripped.
        </p>

        {/* Key input */}
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="playground-key" className="mb-1 block text-sm font-medium">
              API key
            </label>
            <div className="flex gap-2">
              <input
                id="playground-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk_test_..."
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950"
              />
              <button
                type="button"
                onClick={() => setKey(demoKey)}
                className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Use demo key
              </button>
            </div>
          </div>

          {examples.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Try a function:</span>
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPath(example)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    path === example
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {example.replace(/^[^/]+\//, "")}
                </button>
              ))}
            </div>
          )}

          {/* Method + path */}
          <div className="flex flex-wrap gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
              <span className="shrink-0 text-gray-400">/api/v1/</span>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                spellCheck={false}
                aria-label="Gateway path"
                className="w-full bg-transparent font-mono outline-none"
              />
            </div>
          </div>

          {method !== "GET" && (
            <div>
              <label htmlFor="playground-body" className="mb-1 block text-sm font-medium">
                JSON body
              </label>
              <textarea
                id="playground-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                spellCheck={false}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-950"
              />
            </div>
          )}

          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex flex-wrap items-center gap-2">
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
              {result.ok && (
                <span className="text-xs text-gray-400">
                  vendor headers stripped: Server · X-Powered-By · X-Vendor · Via
                </span>
              )}
            </div>
            {result.headers.length > 0 && (
              <pre className="mt-3 overflow-x-auto text-xs text-gray-500 dark:text-gray-400">
                {result.headers.map(([name, value]) => `${name}: ${value}`).join("\n")}
              </pre>
            )}
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs dark:bg-gray-900">
              {result.body}
            </pre>
          </div>
        )}
      </div>

      {/* Demo logins */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="font-semibold">Demo logins</h3>
          <dl className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
            <div className="flex justify-between gap-4">
              <dt>Customer</dt>
              <dd className="text-right font-mono text-xs">
                {demoEmail} / {demoPassword}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Admin</dt>
              <dd className="text-right font-mono text-xs">
                admin@test.local / testpass123
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-400">
            Customer dashboard: /login · Admin vault: /admin/login
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="font-semibold">What just happened</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600 dark:text-gray-300">
            <li>Your <code className="font-mono">sk_test_…</code> key was looked up by hash</li>
            <li>The sandbox key for the vendor was decrypted server-side</li>
            <li>Request forwarded as the vendor, response re-branded for you</li>
            <li>Usage was counted for your plan</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
