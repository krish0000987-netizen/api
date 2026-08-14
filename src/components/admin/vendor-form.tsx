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
};

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
    };

    // On edit, empty key fields keep the existing encrypted keys.
    const sandboxKey = String(form.get("sandboxKey") ?? "").trim();
    const liveKey = String(form.get("liveKey") ?? "").trim();
    if (sandboxKey) body.sandboxKey = sandboxKey;
    if (liveKey) body.liveKey = liveKey;

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

      router.push("/admin/vendors");
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
            Vendor name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={vendor?.name}
            placeholder="e.g. Twilio SMS"
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
            placeholder="e.g. sms — customers call /api/v1/sms/..."
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-500">
            Lowercase letters, numbers, and hyphens. This is the URL segment
            customers use: <code>/api/v1/&#123;slug&#125;/...</code>
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
          <p className="mt-1 text-xs text-gray-500">
            Lower number = tried first when a route has multiple vendors.
          </p>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={vendor?.enabled ?? true}
              className="h-4 w-4"
            />
            Enabled
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Add vendor" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={() => router.push("/admin/vendors")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
