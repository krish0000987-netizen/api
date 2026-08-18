import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/pricing";

export const metadata = { title: "API Documentation" };

export default async function ApiDocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { slug } = await params;
  const product = await prisma.apiProduct.findFirst({
    where: { slug, status: "published" },
    orderBy: { version: "desc" },
    include: {
      vendor: { select: { name: true } },
      fields: { orderBy: { position: "asc" } },
      mappings: { orderBy: { position: "asc" } },
    },
  });
  if (!product) notFound();

  const curlBody = buildExampleBody(product.fields);
  const endpoint = `/api/v1/${product.slug}`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">/{product.slug} · v{product.version} · {product.vendor.name}</p>
            <h1 className="text-2xl font-bold">{product.displayName}</h1>
            {product.description && <p className="mt-1 text-sm text-gray-500">{product.description}</p>}
          </div>
          <Link
            href={`/apis/${product.slug}/playground`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try in playground
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {formatMoney(product.defaultPrice)}/request
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {product.supportsSandbox ? "Sandbox" : ""}{product.supportsSandbox && product.supportsLive ? " · " : ""}{product.supportsLive ? "Live" : ""}
          </span>
          {product.category && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {product.category}
            </span>
          )}
        </div>
      </div>

      <Section title="Endpoint">
        <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
          {`${product.method} ${endpoint}`}
        </pre>
        <p className="mt-2 text-sm text-gray-500">
          Provider endpoint: <code className="font-mono">{product.baseUrl}{product.endpointPath}</code>
        </p>
      </Section>

      <Section title="Authentication">
        <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
          {`Authorization: Bearer YOUR_API_KEY`}
        </pre>
        <p className="mt-2 text-sm text-gray-500">
          Get your key from the dashboard. Never share it. The platform calls
          the provider on your behalf — you never see provider credentials.
        </p>
      </Section>

      <Section title="Request">
        {product.fields.length === 0 ? (
          <p className="text-sm text-gray-500">No request fields required.</p>
        ) : (
          <>
            <table className="w-full overflow-hidden rounded-xl border border-gray-200 text-left text-sm dark:border-gray-800">
              <thead className="bg-gray-100 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Field</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Required</th>
                  <th className="px-4 py-2 font-medium">Validation</th>
                  <th className="px-4 py-2 font-medium">Sensitive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {product.fields.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-2">
                      <code className="font-mono">{f.variable}</code>
                      <div className="text-xs text-gray-400">{f.name}</div>
                    </td>
                    <td className="px-4 py-2">{f.type}</td>
                    <td className="px-4 py-2">{f.required ? "Yes" : "No"}</td>
                    <td className="px-4 py-2">
                      {f.validation ? <code className="font-mono text-xs">{f.validation}</code> : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {f.sensitive ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          masked
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4">
              <div className="mb-1 text-sm font-medium">Example</div>
              <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
                {curlBody}
              </pre>
            </div>
          </>
        )}
      </Section>

      <Section title="Response">
        {product.mappings.length === 0 ? (
          <p className="text-sm text-gray-500">
            Raw response mode — the provider&apos;s JSON is returned (sensitive
            fields redacted per platform policy).
          </p>
        ) : (
          <>
            <table className="w-full overflow-hidden rounded-xl border border-gray-200 text-left text-sm dark:border-gray-800">
              <thead className="bg-gray-100 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Field</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Masked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {product.mappings.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2"><code className="font-mono">{m.customerField}</code></td>
                    <td className="px-4 py-2"><code className="font-mono text-xs">{m.providerPath}</code></td>
                    <td className="px-4 py-2">{m.mask ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4">
              <div className="mb-1 text-sm font-medium">Normalized example</div>
              <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
                {JSON.stringify(
                  {
                    success: true,
                    api: product.slug,
                    request_id: "req_01JXXXXXXX",
                    verification_status: "verified",
                    data: Object.fromEntries(product.mappings.map((m) => [m.customerField, "value"])),
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </>
        )}
      </Section>

      <Section title="Error handling">
        <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
          {JSON.stringify(
            {
              success: false,
              request_id: "req_01JXXXXXXX",
              error: { code: "INVALID_DOCUMENT", message: "The document could not be verified." },
            },
            null,
            2,
          )}
        </pre>
        <p className="mt-2 text-sm text-gray-500">
          Each response includes an <code className="font-mono">X-Request-Id</code> header you can
          quote when contacting support.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function buildExampleBody(fields: Array<{ variable: string; example: string | null; type: string }>): string {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.example) {
      body[f.variable] =
        f.type === "number" ? Number(f.example) : f.type === "boolean" ? f.example === "true" : f.example;
    } else {
      body[f.variable] = f.type === "number" ? 0 : f.type === "boolean" ? true : "your_value";
    }
  }
  return JSON.stringify(body, null, 2);
}