"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { importVendorsConfigAction } from "@/lib/admin-actions";

export function ConfigImport() {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: true; created: number; updated: number; errors: string[] } | { ok: false; error: string } | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/json": [".json"] },
    multiple: false,
    onDrop: async (files) => {
      const file = files[0];
      if (!file) return;
      const text = await file.text();
      const res = await importVendorsConfigAction(text);
      setResult(res);
      if (res.ok) router.refresh();
    },
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-1 text-lg font-semibold">Import vendor settings</h2>
      <p className="mb-4 text-sm text-gray-500">
        Drop a <code>.json</code> config file to create or update vendors. Keys
        are encrypted at rest; leave them out to keep existing keys.
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
        {isDragActive ? "Drop the file here…" : "Drag a .json file here, or click to browse"}
      </div>
      {result && result.ok && (
        <p className="mt-3 text-sm text-green-700 dark:text-green-300">
          Imported: {result.created} created, {result.updated} updated
          {result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}.
        </p>
      )}
      {result && !result.ok && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{result.error}</p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-gray-500">Example config format</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs dark:bg-gray-900">{`{
  "vendors": [
    {
      "name": "Twilio SMS",
      "slug": "sms",
      "sandboxEndpoint": "https://api.example.com/sandbox",
      "sandboxKey": "sandbox-secret",
      "liveEndpoint": "https://api.example.com/v1",
      "liveKey": "live-secret",
      "priority": 0,
      "enabled": true
    }
  ]
}`}</pre>
      </details>
    </div>
  );
}
