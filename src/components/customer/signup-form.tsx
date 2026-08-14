"use client";

import { useState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/customer-actions";

type Reveal = { apiKey: string; masked: string } | null;

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signupAction(new FormData(event.currentTarget));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReveal(result);
  }

  async function copyKey() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the key is still visible on screen.
    }
  }

  if (reveal) {
    return (
      <div className="mt-6 space-y-4">
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
          Your account is ready! 🎉
        </p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Here is your API key — it is shown <strong>only once</strong>.
            Copy it now. For security, we only store a hash of it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-900">
              {reveal.apiKey}
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
        <Link
          href="/dashboard"
          className="inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Go to your dashboard →
        </Link>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900";

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name (optional)
        </label>
        <input id="name" name="name" autoComplete="name" className={inputClass} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
