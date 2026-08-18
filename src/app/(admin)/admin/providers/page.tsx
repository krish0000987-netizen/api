import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { VendorForm } from "@/components/admin/vendor-form";
import { VendorsTable } from "@/components/admin/vendors-table";
import { VendorPriorityList } from "@/components/admin/vendor-priority-list";
import { ConfigImport } from "@/components/admin/config-import";

export const metadata = { title: "Providers" };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  degraded: { label: "Degraded", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  down: { label: "Down", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  unknown: { label: "Unknown", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
};

export default async function AdminProvidersPage() {
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
    authType: string | null;
    authHeaderName: string | null;
    health: { status: string; successRate: number; avgResponseMs: number } | null;
    _count: { products: number };
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
        authType: true,
        authHeaderName: true,
        health: { select: { status: true, successRate: true, avgResponseMs: true } },
        _count: { select: { products: true } },
      },
    });
  } catch (error) {
    console.error("Providers page DB error:", error);
    dbError = true;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">API Providers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Provider credentials are encrypted at rest (AES-256-GCM) and never
          shown again after saving. Each provider supports a configurable
          authentication mechanism used by the gateway.
        </p>
      </div>

      {dbError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="text-lg font-semibold">Database not connected yet</h2>
          <p className="mt-2 text-sm">
            Create your database, put the connection strings in <code>.env</code>,
            then run <code>npx prisma migrate dev</code>.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">Add a provider</h2>
            <VendorForm mode="create" />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Fallback order (drag to reorder)</h2>
            <p className="mb-3 text-sm text-gray-500">
              When a product has fallback providers enabled, the top one is tried first.
            </p>
            {vendors.length === 0 ? (
              <p className="text-sm text-gray-500">No providers yet.</p>
            ) : (
              <div className="max-w-md">
                <VendorPriorityList vendors={vendors.map((v) => ({ id: v.id, name: v.name, slug: v.slug }))} />
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Your providers ({vendors.length})</h2>
            {vendors.length === 0 ? (
              <p className="text-sm text-gray-500">
                No providers yet — add your first one above.
              </p>
            ) : (
              <div className="space-y-4">
                {vendors.map((v) => {
                  const meta = STATUS_META[v.health?.status ?? "unknown"] ?? STATUS_META.unknown;
                  return (
                    <div
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{v.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
                            {meta.label}
                          </span>
                          {v.enabled ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
                              Enabled
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                              Disabled
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                          <span className="font-mono">/{v.slug}</span>
                          <span>auth: <code className="font-mono">{v.authType ?? "bearer"}{v.authHeaderName ? ` (${v.authHeaderName})` : ""}</code></span>
                          <span>{v._count.products} API product{v._count.products === 1 ? "" : "s"}</span>
                          {v.health && (
                            <>
                              <span>{v.health.successRate}% success</span>
                              <span>{v.health.avgResponseMs}ms avg</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`/admin/vendors/${v.id}/edit`}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          Edit
                        </a>
                        <a
                          href={`/admin/apis/new?vendor=${v.id}`}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          + Add API
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Key fingerprints</h2>
            <VendorsTable vendors={vendors} />
          </section>

          <ConfigImport />
        </>
      )}
    </div>
  );
}