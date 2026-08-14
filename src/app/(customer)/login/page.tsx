import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/customer/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect(session.user.role === "admin" ? "/admin" : "/dashboard");
  }

  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID,
  );

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Log in</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Welcome back. Sign in to manage your API keys and usage.
      </p>
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}
