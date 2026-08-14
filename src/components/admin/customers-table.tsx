"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRevokeKeyAction, adminReissueKeyAction } from "@/lib/admin-actions";

type CustomerRow = {
  id: string;
  email: string;
  name: string | null;
  mode: string;
  plan: string;
  apiKeyPrefix: string | null;
  apiKeyRevoked: boolean;
  requests: number;
  createdAt: Date;
};

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ email: string; apiKey: string; masked: string } | null>(null);

  async function revoke(customer: CustomerRow) {
    if (!window.confirm(`Revoke the API key for ${customer.email}? Requests using it will be rejected.`)) return;
    setBusy(customer.id);
    await adminRevokeKeyAction(customer.id);
    setBusy(null);
    router.refresh();
  }

  async function reissue(customer: CustomerRow) {
    if (!window.confirm(`Issue a new API key for ${customer.email}? The current key will stop working.`)) return;
    setBusy(customer.id);
    const result = await adminReissueKeyAction(customer.id);
    setBusy(null);
    if (result.ok) {
      setReveal(result);
    } else {
      alert(result.error);
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {reveal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            New key for {reveal.email} — shown once, share it securely:
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-900">
            {reveal.apiKey}
          </code>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">masked: {reveal.masked}</p>
        </div>
      )}

      {customers.length === 0 ? (
        <p className="text-sm text-gray-500">
          No customers yet. Use the import below or wait for sign-ups.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">API key</th>
                <th className="px-4 py-2 font-medium">Requests</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name ?? c.email}</p>
                    <p className="text-xs text-gray-500">{c.name ? c.email : ""}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{c.mode}</td>
                  <td className="px-4 py-3 capitalize">{c.plan}</td>
                  <td className="px-4 py-3">
                    {c.apiKeyRevoked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                        Revoked
                      </span>
                    ) : (
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                        {c.apiKeyPrefix ?? "sk_…"}
                      </code>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.requests}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => reissue(c)}
                      className="mr-3 text-blue-600 hover:underline disabled:opacity-50"
                    >
                      Reissue key
                    </button>
                    <button
                      type="button"
                      disabled={busy === c.id || c.apiKeyRevoked}
                      onClick={() => revoke(c)}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
