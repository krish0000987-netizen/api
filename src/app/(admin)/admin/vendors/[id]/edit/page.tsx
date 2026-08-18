import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { VendorForm } from "@/components/admin/vendor-form";

export const metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;

  let vendor: {
    id: string;
    name: string;
    slug: string;
    sandboxEndpoint: string;
    liveEndpoint: string;
    priority: number;
    enabled: boolean;
    authType: string | null;
    authHeaderName: string | null;
    authQueryParam: string | null;
  } | null = null;
  let dbError = false;

  try {
    vendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        sandboxEndpoint: true,
        liveEndpoint: true,
        priority: true,
        enabled: true,
        authType: true,
        authHeaderName: true,
        authQueryParam: true,
      },
    });
  } catch (error) {
    console.error("Edit vendor page DB error:", error);
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

  if (!vendor) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/vendors" className="text-sm text-blue-600 hover:underline">
          ← Back to vendors
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit {vendor.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Leave a key field blank to keep the existing encrypted key.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <VendorForm mode="edit" vendor={vendor} />
      </div>
    </div>
  );
}
