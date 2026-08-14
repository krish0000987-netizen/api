// CSRF defense-in-depth for state-changing API routes. Browsers send an
// Origin header on cross-origin requests; a legit same-origin fetch from our
// own admin UI carries our own host. Non-browser clients (curl, server-to-
// server) don't send Origin at all and are allowed through — they don't carry
// ambient browser credentials.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
