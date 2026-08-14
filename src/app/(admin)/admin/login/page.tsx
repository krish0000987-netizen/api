import type { Metadata } from "next";
import { getAdminSession } from "@/lib/require-admin";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Admin login" };

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold">Admin login</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Sign in with the admin account created by <code>npm run seed</code>.
      </p>
      <LoginForm />
    </div>
  );
}
