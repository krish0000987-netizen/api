"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  sandboxEndpoint: string;
  sandboxKeyFingerprint: string;
  liveEndpoint: string;
  liveKeyFingerprint: string;
  priority: number;
  enabled: boolean;
};

function MaskedKey({ fingerprint }: { fingerprint: string }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
      ••••••••{fingerprint}
    </code>
  );
}

export function VendorsTable({ vendors }: { vendors: VendorRow[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(vendor: VendorRow) {
    if (!window.confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return;
    setDeleting(vendor.id);
    try {
      const response = await fetch(`/api/admin/vendors/${vendor.id}`, { method: "DELETE" });
      if (!response.ok) {
        alert("Delete failed. Please try again.");
      }
      router.refresh();
    } catch {
      alert("Delete failed. Is the server running?");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-100 dark:bg-gray-900">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Slug</th>
            <th className="px-4 py-2 font-medium">Sandbox</th>
            <th className="px-4 py-2 font-medium">Live</th>
            <th className="px-4 py-2 font-medium">Priority</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {vendors.map((vendor) => (
            <tr key={vendor.id}>
              <td className="px-4 py-3 font-medium">{vendor.name}</td>
              <td className="px-4 py-3">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                  {vendor.slug}
                </code>
              </td>
              <td className="px-4 py-3">
                <div className="text-xs text-gray-500">{vendor.sandboxEndpoint}</div>
                <MaskedKey fingerprint={vendor.sandboxKeyFingerprint} />
              </td>
              <td className="px-4 py-3">
                <div className="text-xs text-gray-500">{vendor.liveEndpoint}</div>
                <MaskedKey fingerprint={vendor.liveKeyFingerprint} />
              </td>
              <td className="px-4 py-3">{vendor.priority}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    vendor.enabled
                      ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  }
                >
                  {vendor.enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <Link
                  href={`/admin/vendors/${vendor.id}/edit`}
                  className="mr-3 text-blue-600 hover:underline"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={deleting === vendor.id}
                  onClick={() => handleDelete(vendor)}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  {deleting === vendor.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
