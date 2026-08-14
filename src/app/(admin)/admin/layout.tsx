import Link from "next/link";
import { getAdminSession } from "@/lib/require-admin";
import { LogoutButton } from "@/components/admin/logout-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b bg-white dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/admin" className="hover:text-blue-600">
              Dashboard
            </Link>
            {session && (
              <>
                <Link href="/admin/vendors" className="hover:text-blue-600">
                  Vendors
                </Link>
                <Link href="/admin/customers" className="hover:text-blue-600">
                  Customers
                </Link>
              </>
            )}
          </nav>
          <div className="text-sm">
            {session ? (
              <div className="flex items-center gap-4">
                <span className="hidden text-gray-500 sm:inline">{session.user.email}</span>
                <LogoutButton />
              </div>
            ) : (
              <Link href="/admin/login" className="font-medium text-blue-600 hover:text-blue-700">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
