import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { CustomersTable } from "@/components/admin/customers-table";
import { CustomersImport } from "@/components/admin/customers-import";

export const metadata = { title: "Customers" };

export default async function AdminCustomersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  let customers: Array<{
    id: string;
    email: string;
    name: string | null;
    mode: string;
    plan: string;
    apiKeyPrefix: string | null;
    apiKeyRevoked: boolean;
    requests: number;
    createdAt: Date;
  }> = [];
  let dbError = false;

  try {
    const rows = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        mode: true,
        plan: true,
        apiKeyPrefix: true,
        apiKeyRevoked: true,
        createdAt: true,
        _count: { select: { usageEvents: true } },
      },
    });
    customers = rows.map((c) => ({
      ...c,
      requests: c._count.usageEvents,
    }));
  } catch (error) {
    console.error("Customers page DB error:", error);
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
        <h2 className="text-lg font-semibold">Database not connected yet</h2>
        <p className="mt-2 text-sm">
          Create your Neon database, put the connection strings in{" "}
          <code>.env</code>, then run <code>npx prisma migrate dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="mt-1 text-sm text-gray-500">
          {customers.length} customer{customers.length === 1 ? "" : "s"} — manage
          their API keys or bulk-import new accounts.
        </p>
      </div>

      <section>
        <CustomersTable customers={customers} />
      </section>

      <CustomersImport />
    </div>
  );
}
