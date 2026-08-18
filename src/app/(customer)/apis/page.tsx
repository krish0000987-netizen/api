import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/pricing";
import { EnableProductButton } from "@/components/customer/enable-product-button";

export const metadata = { title: "Available APIs" };

export default async function CustomerApisPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "customer") redirect("/admin");

  const [products, integrations] = await Promise.all([
    prisma.apiProduct.findMany({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      include: {
        vendor: { select: { name: true } },
        _count: { select: { fields: true } },
      },
    }),
    prisma.customerIntegration.findMany({
      where: { customerId: session.user.id },
      select: { vendorId: true, enabled: true },
    }),
  ]);

  const enabledVendors = new Set(integrations.filter((i) => i.enabled).map((i) => i.vendorId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Available APIs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enable the APIs you want to use, read their documentation, and call
          them with your branded API key at{" "}
          <code className="font-mono">/api/v1/&#123;api&#125;</code>.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          No published APIs yet — check back soon.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const enabled = enabledVendors.has(p.vendorId);
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{p.displayName}</h2>
                    <p className="text-xs text-gray-500">{p.vendor.name}</p>
                  </div>
                  {p.category && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {p.category}
                    </span>
                  )}
                </div>
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-gray-500">{p.description}</p>}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <code className="font-mono">/api/v1/{p.slug}</code>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {formatMoney(p.defaultPrice)}/request · {p._count.fields} input field{p._count.fields === 1 ? "" : "s"}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <EnableProductButton productId={p.id} slug={p.slug} enabled={enabled} />
                  <Link
                    href={`/apis/${p.slug}/docs`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Docs
                  </Link>
                  <Link
                    href={`/apis/${p.slug}/playground`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Playground
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}