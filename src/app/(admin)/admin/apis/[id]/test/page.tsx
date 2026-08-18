import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { ApiTester } from "@/components/admin/api-tester";
import { formatMoney } from "@/lib/pricing";

export const metadata = { title: "API Tester" };

export default async function ApiTesterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const product = await prisma.apiProduct.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      fields: { orderBy: { position: "asc" } },
    },
  });
  if (!product) notFound();

  const fields = product.fields.map((f) => ({
    variable: f.variable,
    name: f.name,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder,
    example: f.example,
    enumOptions: Array.isArray(f.enumOptions) ? (f.enumOptions as string[]) : null,
    sensitive: f.sensitive,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Tester</h1>
          <p className="mt-1 text-sm text-gray-500">
            {product.displayName} · {product.vendor.name} ·{" "}
            <code className="font-mono">
              {product.method} {product.baseUrl}
              {product.endpointPath}
            </code>
            {" · "}
            {formatMoney(product.defaultPrice)}/request
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/admin/apis/${product.id}/edit`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Edit config
          </Link>
          <Link
            href="/admin/apis"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ← Back to APIs
          </Link>
        </div>
      </div>

      <ApiTester productId={product.id} fields={fields} method={product.method} />
    </div>
  );
}