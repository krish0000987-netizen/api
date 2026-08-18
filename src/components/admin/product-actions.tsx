"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ProductActions({
  id,
  status,
  fields,
  mappings,
}: {
  id: string;
  status: string;
  fields: number;
  mappings: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "published" | "disabled" | "draft") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-products/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to update status.");
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-products/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to duplicate.");
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this API product? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/api-products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to delete.");
      } else {
        router.push("/admin/apis");
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const linkCls =
    "rounded-md px-2 py-1 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800";
  const dangerCls =
    "rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950";

  return (
    <div>
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <Link href={`/admin/apis/${id}/edit`} className={linkCls}>
          Edit
        </Link>
        <Link href={`/admin/apis/${id}/test`} className={linkCls}>
          Test
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus(status === "published" ? "disabled" : "published")}
          className={linkCls}
        >
          {status === "published" ? "Disable" : "Publish"}
        </button>
        <button type="button" disabled={busy} onClick={duplicate} className={linkCls}>
          Duplicate
        </button>
        <button type="button" disabled={busy} onClick={remove} className={dangerCls}>
          Delete
        </button>
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {fields} fields · {mappings} mappings
      </div>
    </div>
  );
}