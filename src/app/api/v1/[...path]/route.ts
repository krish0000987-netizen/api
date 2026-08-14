import { createHash } from "crypto";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { extractApiKey, buildTargetUrl, stripResponseHeaders, jsonError } from "@/lib/proxy-utils";
import { checkRateLimit, incrementUsageCounter, defaultRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

// Step 1-2: validate the customer's API key against the stored hash.
async function authenticate(request: NextRequest): Promise<
  | { ok: true; customerId: string; mode: "sandbox" | "live" }
  | { ok: false; status: number; error: string }
> {
  const key = extractApiKey(request);
  if (!key) return { ok: false, status: 401, error: "Missing API key. Provide it as 'Authorization: Bearer <key>'." };

  // O(1) lookup via the sha256 index, then verify with bcrypt.
  const lookup = createHash("sha256").update(key).digest("hex");
  const customer = await prisma.customer.findUnique({
    where: { apiKeyLookup: lookup },
    select: { id: true, mode: true, apiKeyRevoked: true, apiKeyHash: true },
  });
  if (!customer) return { ok: false, status: 401, error: "Invalid API key." };
  if (customer.apiKeyRevoked) return { ok: false, status: 403, error: "This API key has been revoked. Generate a new one from your dashboard." };
  if (!(await bcrypt.compare(key, customer.apiKeyHash))) {
    return { ok: false, status: 401, error: "Invalid API key." };
  }
  return { ok: true, customerId: customer.id, mode: customer.mode === "live" ? "live" : "sandbox" };
}

async function handle(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    // (1)-(2) Validate the customer's API key.
    const auth = await authenticate(request);
    if (!auth.ok) return jsonError(auth.status, auth.error);

    // (3) Check the customer's usage against the rate limit (sliding window).
    const allowed = await checkRateLimit(auth.customerId, defaultRateLimit());
    if (!allowed) {
      return jsonError(429, "Rate limit exceeded. Slow down and try again shortly.");
    }

    // (4) Map the first path segment to a vendor.
    const { path } = await params;
    const [slug, ...rest] = path;
    if (!slug) return jsonError(404, "Not found.");

    const vendor = await prisma.vendor.findUnique({
      where: { slug },
      select: {
        id: true,
        enabled: true,
        sandboxEndpoint: true,
        sandboxKeyEnc: true,
        liveEndpoint: true,
        liveKeyEnc: true,
      },
    });
    if (!vendor) return jsonError(404, `Unknown route: ${slug}.`);
    if (!vendor.enabled) return jsonError(503, "This integration is temporarily unavailable.");

    // The customer must have enabled this integration in the Integration Builder.
    const integration = await prisma.customerIntegration.findUnique({
      where: { customerId_vendorId: { customerId: auth.customerId, vendorId: vendor.id } },
      select: { enabled: true },
    });
    if (!integration?.enabled) {
      return jsonError(403, "This integration is not enabled on your account. Enable it in the Integration Builder first.");
    }

    // (5) Decrypt the correct vendor key (sandbox vs live, per the customer's mode).
    const useLive = auth.mode === "live";
    const endpoint = useLive ? vendor.liveEndpoint : vendor.sandboxEndpoint;
    const vendorKey = decryptSecret(useLive ? vendor.liveKeyEnc : vendor.sandboxKeyEnc);

    // (6) Forward the request to the vendor API.
    const target = buildTargetUrl(endpoint, rest, request.nextUrl.search);
    const body = await request.arrayBuffer();

    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete("authorization");
    forwardHeaders.delete("x-api-key");
    forwardHeaders.set("authorization", `Bearer ${vendorKey}`);
    forwardHeaders.delete("host");
    forwardHeaders.set("host", target.host);

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers: forwardHeaders,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
      });
    } catch (error) {
      console.error("Proxy upstream failure:", error);
      return jsonError(502, "The upstream service could not be reached.");
    }

    // (7) Strip vendor-identifying headers from the response.
    const responseHeaders = stripResponseHeaders(upstream.headers);
    const responseBody = await upstream.arrayBuffer();

    // (8) Log the usage event (Postgres history + Redis real-time counter).
    await prisma.usageEvent.create({
      data: {
        customerId: auth.customerId,
        vendorId: vendor.id,
        mode: auth.mode,
        statusCode: upstream.status,
      },
    });
    await incrementUsageCounter(auth.customerId, auth.mode);

    // (9) Return the reformatted response to the customer.
    return new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy gateway error:", error);
    return jsonError(503, "Gateway temporarily unavailable.");
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
