"use client";

import { signOut } from "next-auth/react";

export function LogoutButton({ callbackUrl = "/admin/login" }: { callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl })}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      Log out
    </button>
  );
}
