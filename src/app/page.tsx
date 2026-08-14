import { ApiPlayground } from "@/components/api-playground";

export default function LandingPage() {
  // Demo mode is local-only: when a demo key exists in the environment, the
  // playground and demo logins appear. Production (no DEMO_API_KEY) keeps the
  // clean landing page.
  const demoKey = process.env.DEMO_API_KEY;

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-600 dark:text-blue-400">
          White-Label API Reseller Platform
        </p>
        <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Resell world-class APIs under your own brand.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
          Connect your own vendor API keys, issue branded keys to your customers,
          control sandbox/live modes, and bill on your own terms — no servers to
          manage.
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="/signup"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Get started
          </a>
          <a
            href="/login"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Log in
          </a>
        </div>
        <p className="mt-10 max-w-xl text-xs text-gray-400">
          Every request through the gateway is re-branded: your customers see
          your name, never the upstream vendor.
        </p>
      </section>

      {demoKey && (
        <ApiPlayground
          demoKey={demoKey}
          demoEmail={process.env.DEMO_EMAIL ?? "demo@demo.com"}
          demoPassword={process.env.DEMO_PASSWORD ?? "demo123456"}
        />
      )}
    </main>
  );
}
