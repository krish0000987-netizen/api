"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { importCustomersCsvAction } from "@/lib/admin-actions";

type ImportResult = {
  ok: true;
  created: number;
  errors: string[];
  passwords: Array<{ email: string; password: string; masked: string }>;
};

export function CustomersImport() {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | { ok: false; error: string } | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "text/csv": [".csv"], "text/plain": [".txt"] },
    multiple: false,
    onDrop: async (files) => {
      const file = files[0];
      if (!file) return;
      const text = await file.text();
      const res = await importCustomersCsvAction(text);
      setResult(res);
      if (res.ok) router.refresh();
    },
  });

  async function copy(email: string, password: string) {
    try {
      await navigator.clipboard.writeText(`${email} / ${password}`);
      setCopied((prev) => ({ ...prev, [email]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [email]: false })), 2000);
    } catch {
      // clipboard unavailable — the table is on screen
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-1 text-lg font-semibold">Bulk-import customers</h2>
      <p className="mb-4 text-sm text-gray-500">
        Drop a CSV with columns <code>email,name</code>. Each customer gets an
        API key and a one-time temporary password shown below.
      </p>
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center text-sm transition ${
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
            : "border-gray-300 hover:border-blue-400 dark:border-gray-700"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? "Drop the file here…" : "Drag a .csv file here, or click to browse"}
      </div>

      {result && result.ok && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-green-700 dark:text-green-300">
            Imported {result.created} customer{result.created === 1 ? "" : "s"}
            {result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""}.
          </p>
          {result.passwords.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-amber-200 dark:border-amber-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-amber-50 dark:bg-amber-950">
                  <tr>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Temporary password (shown once)</th>
                    <th className="px-3 py-2 font-medium">API key</th>
                    <th className="px-3 py-2 font-medium">Copy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 dark:divide-amber-900">
                  {result.passwords.map((p) => (
                    <tr key={p.email}>
                      <td className="px-3 py-2">{p.email}</td>
                      <td className="px-3 py-2 font-mono">{p.password}</td>
                      <td className="px-3 py-2 font-mono">{p.masked}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => copy(p.email, p.password)}
                          className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200"
                        >
                          {copied[p.email] ? "Copied!" : "Copy"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.errors.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-gray-500">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
              </summary>
              <ul className="mt-2 list-inside list-disc text-xs text-gray-500">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {result && !result.ok && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{result.error}</p>
      )}
    </div>
  );
}
