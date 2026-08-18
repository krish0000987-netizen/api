"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EnableProductButton({
  productId,
  slug,
  enabled,
}: {
  productId: string;
  slug: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const action = enabled ? "disable" : "enable";
    const res = await fetch(`/api/customer/products/${productId}/${action}`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        enabled
          ? "border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
    >
      {enabled ? "Enabled ✓" : "Enable"}
    </button>
  );
}