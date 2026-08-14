import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { VendorForm } from "@/components/admin/vendor-form";
import { VendorsTable } from "@/components/admin/vendors-table";
import { VendorPriorityList } from "@/components/admin/vendor-priority-list";
import { ConfigImport } from "@/components/admin/config-import";

export const metadata = { title: "Vendors" };

export default async function AdminVendorsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  let vendors: Array<{
    id: string;
    name: string;
    slug: string;
    sandboxEndpoint: string;
    sandboxKeyFingerprint: string;
    liveEndpoint: string;
    liveKeyFingerprint: string;
    priority: number;
    enabled: boolean;
  }> = [];
  let dbError = false;

  try {
    vendors = await prisma.vendor.findMany({
      orderBy: [{ priority: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        sandboxEndpoint: true,
        sandboxKeyFingerprint: true,
        liveEndpoint: true,
        liveKeyFingerprint: true,
        priority: true,
        enabled: true,
      },
    });
  } catch (error) {
    console.error("Vendors page DB error:", error);
    dbError = true;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Vendor Key Vault</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vendor API keys are encrypted at rest (AES-256-GCM) and never shown
          again after saving — only a masked fingerprint is displayed.
        </p>
      </div>

      {dbError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="text-lg font-semibold">Database not connected yet</h2>
          <p className="mt-2 text-sm">
            Create your Neon database, put the connection strings in{" "}
            <code>.env</code>, then run <code>npx prisma migrate dev</code>. See
            the README for details.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Add a vendor</h2>
            <VendorForm mode="create" />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Fallback order (drag to reorder)</h2>
            <p className="mb-3 text-sm text-gray-500">
              When a route has multiple vendors, the top one is tried first.
              Reorder with mouse, touch, or keyboard (focus the handle and use
              arrow keys).
            </p>
            {vendors.length === 0 ? (
              <p className="text-sm text-gray-500">No vendors yet.</p>
            ) : (
              <div className="max-w-md">
                <VendorPriorityList vendors={vendors.map((v) => ({ id: v.id, name: v.name, slug: v.slug }))} />
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Your vendors ({vendors.length})</h2>
            {vendors.length === 0 ? (
              <p className="text-sm text-gray-500">
                No vendors yet — add your first one above. Use dummy keys to try
                it out.
              </p>
            ) : (
              <VendorsTable vendors={vendors} />
            )}
          </section>

          <ConfigImport />
        </>
      )}
    </div>
  );
}
