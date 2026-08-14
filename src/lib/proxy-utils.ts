// Headers that could reveal the upstream vendor or its infrastructure.
const STRIP_RESPONSE_HEADERS = new Set([
  "server",
  "x-powered-by",
  "via",
  "x-served-by",
  "x-backend",
  "x-frontend",
  "x-varnish",
  "x-vendor",
]);

export function stripResponseHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of headers.entries()) {
    if (!STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) {
      out.set(name, value);
    }
  }
  return out;
}

// Append the request's remaining path segments to the vendor endpoint and
// carry over the query string.
export function buildTargetUrl(
  vendorEndpoint: string,
  remainingSegments: string[],
  search: string,
): URL {
  const url = new URL(vendorEndpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  const rest = remainingSegments.map(encodeURIComponent).join("/");
  url.pathname = [basePath, rest].filter(Boolean).join("/");
  url.search = search;
  return url;
}

// Accept "Authorization: Bearer sk_test_..." (or a bare key) and, as a
// convenience, an "x-api-key" header.
export function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const trimmed = auth.trim();
    if (trimmed.startsWith("Bearer ")) {
      const token = trimmed.slice("Bearer ".length).trim();
      if (token) return token;
    } else if (trimmed.startsWith("sk_")) {
      return trimmed;
    }
  }
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey.trim()) return apiKey.trim();
  return null;
}

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
