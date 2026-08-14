"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setModeAction, regenerateKeyAction, revokeKeyAction } from "@/lib/customer-actions";

type PanelProps = {
  mode: "sandbox" | "live";
  masked: string | null;
  revoked: boolean;
};

export function ApiKeyPanel({ mode, masked, revoked }: PanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string; apiKey?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    if ("apiKey" in result && result.apiKey) {
      setNewKey(result.apiKey);
    }
    router.refresh();
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — key stays visible on screen.
    }
  }

  function handleToggle(next: "sandbox" | "live") {
    if (next === mode) return;
    if (next === "live") {
      const ok = window.confirm(
        "Switching to Live mode means requests from your API key will hit real vendor systems and be billed. Continue?",
      );
      if (!ok) return;
    }
    run(() => setModeAction(next));
  }

  function handleRegenerate() {
    const ok = window.confirm(
      "Regenerate your API key? The current key will stop working immediately.",
    );
    if (!ok) return;
    run(regenerateKeyAction);
  }

  function handleRevoke() {
    const ok = window.confirm(
      "Revoke your API key? All requests using it will be rejected until you generate a new one.",
    );
    if (!ok) return;
    run(revokeKeyAction);
  }

  const modeClass = (active: boolean) =>
    active
      ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      : "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800";

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Mode toggle */}
      <div>
        <p className="mb-2 text-sm font-medium">Mode</p>
        <div className="flex gap-2">
          <button type="button" className={modeClass(mode === "sandbox")} onClick={() => handleToggle("sandbox")} disabled={busy}>
            Sandbox
          </button>
          <button type="button" className={modeClass(mode === "live")} onClick={() => handleToggle("live")} disabled={busy}>
            Live
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {mode === "sandbox"
            ? "Sandbox requests never touch real vendor systems and are not billed."
            : "Live requests use your production vendor keys and count toward billing."}
        </p>
      </div>

      {/* API key */}
      <div>
        <p className="mb-2 text-sm font-medium">Your API key</p>
        {revoked ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            Your API key is <strong>revoked</strong>. Requests with it are being
            rejected. Generate a new one to restore access.
          </div>
        ) : (
          <code className="rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800">
            {masked ?? "sk_…"}
          </code>
        )}

        {newKey && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Your new API key — shown only once. Copy it now.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-900">
                {newKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Regenerate key
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={busy || revoked}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
          >
            Revoke key
          </button>
        </div>
      </div>
    </div>
  );
}
