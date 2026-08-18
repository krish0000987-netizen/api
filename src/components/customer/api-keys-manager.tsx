"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type KeyRow = {
  id: string;
  name: string | null;
  apiKeyPrefix: string | null;
  mode: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ apiKey: string; masked: string } | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create key.");
        return;
      }
      setNewKey({ apiKey: data.apiKey, masked: data.masked });
      setName("");
      router.refresh();
    } catch {
      setError("Failed to create key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this API key? It will stop working immediately.")) return;
    setBusy(true);
    try {
      await fetch(`/api/customer/api-keys/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.apiKey);
    } catch {
      // Clipboard unavailable — key stays visible on screen.
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Create */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-40">
          <label htmlFor="key-name" className="mb-1 block text-xs font-medium text-gray-500">
            Key name
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. production-server, staging-cli"
            spellCheck={false}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
        </div>
        <div>
          <label htmlFor="key-mode" className="mb-1 block text-xs font-medium text-gray-500">
            Mode
          </label>
          <select
            id="key-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "sandbox" | "live")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          >
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Create key
        </button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            New API key — shown only once.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-900">
              {newKey.apiKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {keys.length === 0 ? (
        <p className="text-sm text-gray-400">
          No secondary keys yet. Create one to use per-app keys alongside your primary key.
        </p>
      ) : (
        <table className="w-full overflow-hidden rounded-xl border border-gray-200 text-left text-sm dark:border-gray-800">
          <thead className="bg-gray-100 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">Mode</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Last used</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-2">{k.name ?? "—"}</td>
                <td className="px-4 py-2"><code className="font-mono text-xs">{k.apiKeyPrefix ?? "…"}</code></td>
                <td className="px-4 py-2 capitalize">{k.mode}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      k.status === "active"
                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    }`}
                  >
                    {k.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}
                </td>
                <td className="px-4 py-2 text-right">
                  {k.status === "active" && (
                    <button
                      type="button"
                      onClick={() => revoke(k.id)}
                      disabled={busy}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}