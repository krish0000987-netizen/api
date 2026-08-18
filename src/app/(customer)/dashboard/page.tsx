import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ApiKeyPanel } from "@/components/customer/api-key-panel";
import { ApiKeysManager } from "@/components/customer/api-keys-manager";
import { DailyBarChart } from "@/components/charts";
import { SortableWidgetGrid } from "@/components/sortable-widget-grid";
import { saveDashboardLayoutAction } from "@/lib/customer-actions";
import { CUSTOMER_WIDGET_IDS, parseLayout, type Widget } from "@/lib/widgets";

export const metadata = { title: "Dashboard" };

export default async function CustomerDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "customer") redirect("/admin");

  let customer: {
    name: string | null;
    email: string;
    mode: string;
    apiKeyPrefix: string | null;
    apiKeyRevoked: boolean;
    plan: string;
    dashboardLayout: string | null;
    _count: { usageEvents: number };
  } | null = null;
  let daily: Array<{ day: string; count: number }> = [];
  let modeTotals: Array<{ mode: string; total: number }> = [];
  let secondaryKeys: Array<{
    id: string;
    name: string | null;
    apiKeyPrefix: string | null;
    mode: string;
    status: string;
    lastUsedAt: Date | null;
    createdAt: Date;
  }> = [];
  let dbError = false;

  try {
    customer = await prisma.customer.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        mode: true,
        apiKeyPrefix: true,
        apiKeyRevoked: true,
        plan: true,
        dashboardLayout: true,
        _count: { select: { usageEvents: true } },
      },
    });

    const [dailyRows, modeRows, keyRows] = await Promise.all([
      prisma.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS count
        FROM "UsageEvent"
        WHERE "customerId" = ${session.user.id}
          AND "createdAt" >= now() - interval '14 days'
        GROUP BY 1 ORDER BY 1
      `,
      prisma.$queryRaw<Array<{ mode: string; total: number }>>`
        SELECT mode, COUNT(*)::int AS total
        FROM "UsageEvent"
        WHERE "customerId" = ${session.user.id}
        GROUP BY mode
      `,
      prisma.customerApiKey.findMany({
        where: { customerId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          apiKeyPrefix: true,
          mode: true,
          status: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
    ]);
    daily = dailyRows;
    modeTotals = modeRows;
    secondaryKeys = keyRows;
  } catch (error) {
    console.error("Dashboard DB error:", error);
    dbError = true;
  }

  if (dbError || !customer) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
        <h2 className="text-lg font-semibold">Database not connected yet</h2>
        <p className="mt-2 text-sm">
          Create your Neon database, put the connection strings in{" "}
          <code>.env</code>, then run <code>npx prisma migrate dev</code>. See
          the README for details.
        </p>
      </div>
    );
  }

  const mode = customer.mode === "live" ? "live" : "sandbox";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {customer.name ? `Welcome back, ${customer.name}` : "Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{customer.email}</p>
      </div>

      <CustomerWidgets customer={customer} mode={mode} modeTotals={modeTotals} />

      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold">API key</h2>
        <ApiKeyPanel mode={mode} masked={customer.apiKeyPrefix} revoked={customer.apiKeyRevoked} />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold">Secondary API keys</h2>
        <p className="mb-4 text-sm text-gray-500">
          Create extra keys per app or service. Each key works exactly like your
          primary key and can be revoked independently.
        </p>
        <ApiKeysManager
          keys={secondaryKeys.map((k) => ({
            ...k,
            lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
            createdAt: k.createdAt.toISOString(),
          }))}
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold">Your requests per day (last 14 days)</h2>
        <DailyBarChart
          data={daily}
          emptyLabel="No requests yet. Call the gateway with your API key and the chart will fill in."
        />
        {modeTotals.length > 0 && (
          <div className="mt-4 flex gap-6 text-sm">
            {modeTotals.map((m) => (
              <span key={m.mode} className="text-gray-600 dark:text-gray-300">
                <span className="font-semibold capitalize">{m.mode}</span>: {m.total} request
                {m.total === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CustomerWidgets({
  customer,
  mode,
  modeTotals,
}: {
  customer: {
    plan: string;
    _count: { usageEvents: number };
    dashboardLayout: string | null;
  };
  mode: "sandbox" | "live";
  modeTotals: Array<{ mode: string; total: number }>;
}) {
  const sandbox = modeTotals.find((m) => m.mode === "sandbox")?.total ?? 0;
  const live = modeTotals.find((m) => m.mode === "live")?.total ?? 0;

  const allWidgets: Widget[] = [
    { id: "plan", label: "Plan", value: customer.plan },
    { id: "requests", label: "Total requests", value: String(customer._count.usageEvents) },
    { id: "sandbox", label: "Sandbox requests", value: String(sandbox) },
    { id: "live", label: "Live requests", value: String(live) },
    { id: "mode", label: "Mode", value: mode },
  ];
  const order = parseLayout(customer.dashboardLayout, CUSTOMER_WIDGET_IDS);
  const widgets = order
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is Widget => Boolean(w));

  return (
    <SortableWidgetGrid
      key={order.join(",")}
      widgets={widgets}
      onReorder={saveDashboardLayoutAction}
    />
  );
}
