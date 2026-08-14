import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { IntegrationBuilder } from "@/components/integration-builder";

export const metadata = { title: "Integration Builder" };

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "customer") redirect("/admin");

  let available: Array<{ vendorId: string; name: string; slug: string }> = [];
  let enabled: Array<{ id: string; vendorId: string; name: string; slug: string }> = [];
  let dbError = false;

  try {
    const [allVendors, integrations] = await Promise.all([
      prisma.vendor.findMany({
        where: { enabled: true },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
      prisma.customerIntegration.findMany({
        where: { customerId: session.user.id },
        select: { id: true, vendorId: true, vendor: { select: { name: true, slug: true } } },
        orderBy: { position: "asc" },
      }),
    ]);

    const enabledVendorIds = new Set(integrations.map((i) => i.vendorId));
    available = allVendors
      .filter((v) => !enabledVendorIds.has(v.id))
      .map((v) => ({ vendorId: v.id, name: v.name, slug: v.slug }));
    enabled = integrations.map((i) => ({
      id: i.id,
      vendorId: i.vendorId,
      name: i.vendor.name,
      slug: i.vendor.slug,
    }));
  } catch (error) {
    console.error("Integrations page DB error:", error);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integration Builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drag services onto your canvas to enable them. Once enabled, call
          them with your API key at{" "}
          <code>/api/v1/&#123;service&#125;/...</code>
        </p>
      </div>
      <IntegrationBuilder available={available} enabled={enabled} />
    </div>
  );
}
