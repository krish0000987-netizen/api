import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/pricing";
import { ProductPlayground } from "@/components/customer/product-playground";

export const metadata = { title: "API Playground" };

export default async function ApiPlaygroundPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { slug } = await params;
  const product = await prisma.apiProduct.findFirst({
    where: { slug, status: "published" },
    orderBy: { version: "desc" },
    include: {
      vendor: { select: { name: true } },
      fields: { orderBy: { position: "asc" } },
    },
  });
  if (!product) notFound();

  const liveAllowed = product.supportsLive;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">/{product.slug} · v{product.version} · {product.vendor.name}</p>
        <h1 className="text-2xl font-bold">{product.displayName} — Playground</h1>
        <p className="mt-1 text-sm text-gray-500">
          Test the API live in <span className="font-medium">sandbox mode</span> at{" "}
          <code className="font-mono">/api/v1/{product.slug}</code>.
        </p>
      </div>
      <ProductPlayground
        slug={product.slug}
        method={product.method}
        priceLabel={formatMoney(product.defaultPrice)}
        liveAllowed={liveAllowed}
        supportsSandbox={product.supportsSandbox}
        fields={product.fields.map((f) => ({
          variable: f.variable,
          name: f.name,
          type: f.type,
          required: f.required,
          example: f.example,
        }))}
      />
    </div>
  );
}