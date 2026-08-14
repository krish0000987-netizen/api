import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { DailyBarChart, ErrorRateRow, TopCustomerRow } from "@/components/charts";
import { SortableWidgetGrid } from "@/components/sortable-widget-grid";
import { saveAdminDashboardLayoutAction } from "@/lib/admin-actions";
import { ADMIN_WIDGET_IDS, parseLayout, type Widget } from "@/lib/widgets";

type DailyRow = { day: string; count: number };
type VendorErrorRow = { name: string; slug: string; total: number; errors: number };
type TopCustomerRow = { email: string; total: number };

export default async function AdminDashboardPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  let stats: { vendors: number; customers: number; events: number; auditLogs: number } | null = null;
  let audit: Array<{ id: string; action: string; entity: string; details: string | null; createdAt: Date }> = [];
  let daily: DailyRow[] = [];
  let vendorErrors: VendorErrorRow[] = [];
  let topCustomers: TopCustomerRow[] = [];
  let savedLayout: string | null = null;
  let dbError = false;

  try {
    const [vendors, customers, events, auditLogs, layoutRow, auditRows, dailyRows, vendorRows, customerRows] =
      await Promise.all([
        prisma.vendor.count(),
        prisma.customer.count(),
        prisma.usageEvent.count(),
        prisma.auditLog.count(),
        prisma.admin.findUnique({ where: { id: session.user.id }, select: { dashboardLayout: true } }),
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
        prisma.$queryRaw<DailyRow[]>`
          SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS count
          FROM "UsageEvent"
          WHERE "createdAt" >= now() - interval '14 days'
          GROUP BY 1 ORDER BY 1
        `,
        prisma.$queryRaw<VendorErrorRow[]>`
          SELECT v.name, v.slug,
                 COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE u."statusCode" >= 400)::int AS errors
          FROM "UsageEvent" u
          JOIN "Vendor" v ON v.id = u."vendorId"
          GROUP BY v.id ORDER BY total DESC
        `,
        prisma.$queryRaw<TopCustomerRow[]>`
          SELECT c.email, COUNT(*)::int AS total
          FROM "UsageEvent" u
          JOIN "Customer" c ON c.id = u."customerId"
          GROUP BY c.id ORDER BY total DESC LIMIT 10
        `,
      ]);
    stats = { vendors, customers, events, auditLogs };
    audit = auditRows;
    daily = dailyRows;
    vendorErrors = vendorRows;
    topCustomers = customerRows;
    savedLayout = layoutRow?.dashboardLayout ?? null;
  } catch (error) {
    console.error("Dashboard DB error:", error);
    dbError = true;
  }

  if (dbError || !stats) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
        <h2 className="text-lg font-semibold">Database not connected yet</h2>
        <p className="mt-2 text-sm">
          Create your Neon database, put the connection strings in{" "}
          <code>.env</code>, then run <code>npx prisma migrate dev</code> and{" "}
          <code>npm run seed</code>. See the README for details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <SortableWidgetsBlock
        stats={stats}
        vendorErrors={vendorErrors}
        savedLayout={savedLayout}
      />

      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold">Requests per day (last 14 days)</h2>
        <DailyBarChart data={daily} emptyLabel="No requests yet — traffic appears here once customers call the gateway." />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-lg font-semibold">Error rate per vendor</h2>
          {vendorErrors.length === 0 ? (
            <p className="text-sm text-gray-500">No traffic recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {vendorErrors.map((v) => (
                <ErrorRateRow key={v.slug} vendor={v.name} slug={v.slug} total={v.total} errors={v.errors} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-3 text-lg font-semibold">Top customers by usage</h2>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-gray-500">No customers with traffic yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {topCustomers.map((c, i) => (
                <TopCustomerRow key={c.email} email={c.email} count={c.total} rank={i + 1} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent admin activity</h2>
          <span className="text-sm text-gray-500">{stats.auditLogs} total audit entries</span>
        </div>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No admin actions recorded yet. Actions on vendor keys and customer
            accounts are logged here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {entry.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{entry.action}</td>
                    <td className="px-4 py-2">{entry.entity}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{entry.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SortableWidgetsBlock({
  stats,
  vendorErrors,
  savedLayout,
}: {
  stats: { vendors: number; customers: number; events: number };
  vendorErrors: VendorErrorRow[];
  savedLayout: string | null;
}) {
  const totalErrors = vendorErrors.reduce((sum, v) => sum + v.errors, 0);
  const totalRequests = vendorErrors.reduce((sum, v) => sum + v.total, 0);
  const errorRate = totalRequests === 0 ? 0 : Math.round((totalErrors / totalRequests) * 100);

  const allWidgets: Widget[] = [
    { id: "vendors", label: "Vendors", value: String(stats.vendors) },
    { id: "customers", label: "Customers", value: String(stats.customers) },
    { id: "requests", label: "API requests", value: String(stats.events) },
    { id: "errors", label: "Error rate", value: `${errorRate}%` },
  ];
  const order = parseLayout(savedLayout, ADMIN_WIDGET_IDS);
  const widgets = order
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is Widget => Boolean(w));

  return (
    <SortableWidgetGrid
      key={order.join(",")}
      widgets={widgets}
      onReorder={saveAdminDashboardLayoutAction}
    />
  );
}
