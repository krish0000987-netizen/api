import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { ApiBuilder } from "@/components/admin/api-builder";

export const metadata = { title: "API Builder" };

export default async function NewApiPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { vendor } = await searchParams;

  const [vendors, customers] = await Promise.all([
    prisma.vendor.findMany({
      where: { enabled: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ select: { id: true, email: true }, orderBy: { email: "asc" }, take: 500 }),
  ]);

  const preselectedVendor = vendors.some((v) => v.id === vendor) ? vendor : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure any third-party REST/JSON API as a resellable product. The
          gateway uses this configuration at runtime — no code per provider.
        </p>
      </div>
      <ApiBuilder product={null} vendors={vendors} customers={customers} initialVendorId={preselectedVendor} />
    </div>
  );
}