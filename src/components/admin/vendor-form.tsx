"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type VendorInput = {
  id: string;
  name: string;
  slug: string;
  sandboxEndpoint: string;
  liveEndpoint: string;
  priority: number;
  enabled: boolean;
  authType?: string | null;
  authHeaderName?: string | null;
  authQueryParam?: string | null;
};

const AUTH_TYPES = [
  { value: "bearer", label: "Bearer token" },
  { value: "api_key", label: "API key header" },
  { value: "basic", label: "Basic auth" },
  { value: "custom_header", label: "Custom header" },
  { value: "query", label: "Query parameter" },
  { value: "oauth2", label: "OAuth2" },
  { value: "none", label: "No authentication" },
];

export function VendorForm({
  mode,
  vendor,
}: {
  mode: "create" | "edit";
  vendor?: VendorInput | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authType, setAuthType] = useState(vendor?.authType ?? "bearer");
  const [extraHeaders, setExtraHeaders] = useState<Array<{ name: string; value: string; isSecret: boolean }>>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: String(form.get("name") ?? "").trim(),
      slug: String(form.get("slug") ?? "").trim(),
      sandboxEndpoint: String(form.get("sandboxEndpoint") ?? "").trim(),
      liveEndpoint: String(form.get("liveEndpoint") ?? "").trim(),
      priority: Number(form.get("priority") ?? 0),
      enabled: form.get("enabled") === "on",
      authType,
      authHeaderName: String(form.get("authHeaderName") ?? "").trim() || null,
      authQueryParam: String(form.get("authQueryParam") ?? "").trim() || null,
    };

    // On edit, empty key fields keep the existing encrypted keys.
    const sandboxKey = String(form.get("sandboxKey") ?? "").trim();
    const liveKey = String(form.get("liveKey") ?? "").trim();
    if (sandboxKey) body.sandboxKey = sandboxKey;
    if (liveKey) body.liveKey = liveKey;

    if (authType === "basic") {
      body.authBasic = {
        username: String(form.get("authBasicUser") ?? "").trim(),
        password: String(form.get("authBasicPass") ?? "").trim(),
      };
    }
    if (authType === "oauth2") {
      body.authOAuth = {
        tokenUrl: String(form.get("oauthTokenUrl") ?? "").trim() || null,
        clientId: String(form.get("oauthClientId") ?? "").trim() || null,
        clientSecret: String(form.get("oauthClientSecret") ?? "").trim() || null,
        scope: String(form.get("oauthScope") ?? "").trim() || null,
      };
    }
    if (authType === "custom_header" || authType === "api_key") {
      body.authExtraHeaders = extraHeaders;
    }

    try {
      const url = mode === "create" ? "/api/admin/vendors" : `/api/admin/vendors/${vendor?.id}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        setBusy(false);
        return;
      }

      router.push("/admin/providers");
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Provider name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={vendor?.name}
            placeholder="e.g. CoinCircleTrust"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="slug" className="mb-1 block text-sm font-medium">
            Gateway slug
          </label>
          <input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            defaultValue={vendor?.slug}
            placeholder="e.g. coincircletrust"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            Lowercase letters, numbers, and hyphens.
          </p>
        </div>

        <div>
          <label htmlFor="sandboxEndpoint" className="mb-1 block text-sm font-medium">
            Sandbox endpoint
          </label>
          <input
            id="sandboxEndpoint"
            name="sandboxEndpoint"
            required
            type="url"
            defaultValue={vendor?.sandboxEndpoint}
            placeholder="https://api.example.com/sandbox"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sandboxKey" className="mb-1 block text-sm font-medium">
            Sandbox API key
          </label>
          <input
            id="sandboxKey"
            name="sandboxKey"
            type="password"
            autoComplete="off"
            required={mode === "create"}
            placeholder={mode === "edit" ? "Leave blank to keep current key" : "Your vendor sandbox key"}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="liveEndpoint" className="mb-1 block text-sm font-medium">
            Live endpoint
          </label>
          <input
            id="liveEndpoint"
            name="liveEndpoint"
            required
            type="url"
            defaultValue={vendor?.liveEndpoint}
            placeholder="https://api.example.com/v1"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="liveKey" className="mb-1 block text-sm font-medium">
            Live API key
          </label>
          <input
            id="liveKey"
            name="liveKey"
            type="password"
            autoComplete="off"
            required={mode === "create"}
            placeholder={mode === "edit" ? "Leave blank to keep current key" : "Your vendor live key"}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium">
            Priority (fallback order)
          </label>
          <input
            id="priority"
            name="priority"
            type="number"
            min={0}
            defaultValue={vendor?.priority ?? 0}
            className={inputClass}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={vendor?.enabled ?? true} className="h-4 w-4" />
            Enabled
          </label>
        </div>
      </div>

      {/* Authentication builder (section 2 Step 3 / section 28) */}
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="mb-3 text-sm font-semibold">Provider authentication</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Authentication type</label>
            <select
              className={inputClass}
              value={authType}
              onChange={(e) => setAuthType(e.target.value)}
            >
              {AUTH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {(authType === "api_key" || authType === "custom_header") && (
            <div>
              <label className="mb-1 block text-sm font-medium">Header name</label>
              <input
                className={`${inputClass} font-mono`}
                defaultValue={vendor?.authHeaderName ?? ""}
                name="authHeaderName"
                placeholder="x-api-key"
              />
              <p className="mt-1 text-xs text-gray-500">
                The provider API key (sandbox/live) is sent in this header.
              </p>
            </div>
          )}

          {authType === "query" && (
            <div>
              <label className="mb-1 block text-sm font-medium">Query parameter name</label>
              <input
                className={`${inputClass} font-mono`}
                defaultValue={vendor?.authQueryParam ?? ""}
                name="authQueryParam"
                placeholder="api_key"
              />
            </div>
          )}

          {authType === "basic" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Username</label>
                <input className={inputClass} name="authBasicUser" autoComplete="off" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Password</label>
                <input className={inputClass} name="authBasicPass" type="password" autoComplete="off" />
              </div>
            </>
          )}

          {authType === "oauth2" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Token URL</label>
                <input className={inputClass} name="oauthTokenUrl" type="url" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Client ID</label>
                <input className={inputClass} name="oauthClientId" autoComplete="off" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Client secret</label>
                <input className={inputClass} name="oauthClientSecret" type="password" autoComplete="off" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Scope</label>
                <input className={inputClass} name="oauthScope" />
              </div>
            </>
          )}
        </div>

        {(authType === "custom_header" || authType === "api_key") && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Extra headers</span>
              <button
                type="button"
                onClick={() =>
                  setExtraHeaders([...extraHeaders, { name: "", value: "", isSecret: true }])
                }
                className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                + Add header
              </button>
            </div>
            {extraHeaders.map((h, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClass} max-w-[200px] font-mono`}
                  value={h.name}
                  onChange={(e) =>
                    setExtraHeaders(extraHeaders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Header name"
                />
                <input
                  className={`${inputClass} max-w-[280px] font-mono`}
                  value={h.value}
                  onChange={(e) =>
                    setExtraHeaders(extraHeaders.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  placeholder="Value (stored encrypted)"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={h.isSecret}
                    onChange={(e) =>
                      setExtraHeaders(extraHeaders.map((x, j) => (j === i ? { ...x, isSecret: e.target.checked } : x)))
                    }
                  />
                  secret
                </label>
                <button
                  type="button"
                  onClick={() => setExtraHeaders(extraHeaders.filter((_, j) => j !== i))}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <p className="mt-1 text-xs text-gray-400">
              Secrets are encrypted before storage and never displayed again.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Add provider" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={() => router.push("/admin/providers")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}