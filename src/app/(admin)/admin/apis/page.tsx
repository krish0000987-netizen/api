import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/pricing";
import { ProductActions } from "@/components/admin/product-actions";

export const metadata = { title: "APIs" };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  published: { label: "Published", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
  disabled: { label: "Disabled", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

export default async function AdminApisPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const products = await prisma.apiProduct.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      vendor: { select: { name: true, slug: true } },
      _count: { select: { fields: true, mappings: true, usageEvents: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Products</h1>
          <p className="mt-1 text-sm text-gray-500">
            Universal API configurations. Add any third-party REST/JSON API with the API Builder —
            no code required. Customers call <code>/api/v1/&#123;slug&#125;</code>.
          </p>
        </div>
        <Link
          href="/admin/apis/new"
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add API
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <h2 className="text-lg font-semibold">No APIs configured yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Use the API Builder to configure your first product (e.g. Aadhaar
            Verification, PAN Verification, GST Verification).
          </p>
          <Link
            href="/admin/apis/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open API Builder
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 font-medium">API</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Endpoint</th>
                <th className="px-4 py-2 font-medium">Pricing</th>
                <th className="px-4 py-2 font-medium">Requests</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {products.map((p) => {
                const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.draft;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.displayName}</div>
                      <div className="font-mono text-xs text-gray-500">
                        /api/v{p.version.replace("v", "")}/{p.slug}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.vendor.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500">
                        {p.method} {p.baseUrl}
                        {p.endpointPath}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <div>{p.defaultPrice > 0 ? `${formatMoney(p.defaultPrice)}/request` : "Free"}</div>
                      <div className="text-xs text-gray-400">
                        cost {formatMoney(p.defaultCost)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{p._count.usageEvents}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProductActions
                        id={p.id}
                        status={p.status}
                        fields={p._count.fields}
                        mappings={p._count.mappings}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}