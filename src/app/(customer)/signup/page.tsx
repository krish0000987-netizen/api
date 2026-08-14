import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "@/components/customer/signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  const session = await auth();
  if (session) {
    redirect(session.user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        You&apos;ll get a branded API key (like <code>sk_test_…</code>) that
        lets you call the platform from your own code.
      </p>
      <SignupForm />
    </div>
  );
}
