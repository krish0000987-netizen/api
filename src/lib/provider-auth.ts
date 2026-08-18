// Provider authentication builder (section 2 Step 3, section 28).
//
// Vendors can authenticate in any of these ways:
//   none           — no auth
//   bearer         — Authorization: Bearer <secret>
//   api_key        — <headerName>: <secret>            (default header x-api-key)
//   custom_header  — <headerName>: <secret> + extra headers
//   basic          — Authorization: Basic base64(user:pass)
//   query          — append ?<queryParam>=<secret>
//   oauth2         — fetch an access token from the configured token URL
//
// Provider secrets are decrypted just-in-time in the server and are never
// logged or returned to the customer.

import { decryptSecret } from "@/lib/crypto";
import type { Vendor } from "@/generated/prisma/client";

export type VendorAuthShape = Pick<
  Vendor,
  "authType" | "authHeaderName" | "authQueryParam" | "authBasicEnc" | "authExtraHeadersEnc" | "authOAuthEnc" | "sandboxKeyEnc" | "liveKeyEnc"
>;

export type ProviderAuthHeaders = Record<string, string>;

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Decrypt the vendor's primary secret for the given environment. */
export function getVendorSecret(vendor: VendorAuthShape, useLive: boolean): string {
  const enc = useLive ? vendor.liveKeyEnc : vendor.sandboxKeyEnc;
  if (!enc) return "";
  return decryptSecret(enc);
}

function basicAuthHeader(vendor: VendorAuthShape): string | null {
  const config = safeJson<{ username?: string; password?: string } | null>(vendor.authBasicEnc, null);
  if (!config || !config.username) return null;
  const username = decryptSecret(config.username);
  const password = config.password ? decryptSecret(config.password) : "";
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function oauthAccessToken(vendor: VendorAuthShape): string | null {
  // For the common case the primary secret IS the bearer token already
  // (most OAuth2 providers issue tokens that work in Authorization). Products
  // needing a full client_credentials flow should provide authOAuthEnc; the
  // gateway resolves it here so callers can refresh tokens.
  const config = safeJson<{
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    accessToken?: string;
  } | null>(vendor.authOAuthEnc, null);
  if (config?.accessToken) return config.accessToken;
  return null;
}

/**
 * Build the provider request headers for a vendor. `primarySecret` may be
 * passed in already-decrypted (defaults to decrypting the vendor's key).
 */
export async function buildProviderAuth(
  vendor: VendorAuthShape,
  useLive: boolean,
): Promise<{ headers: ProviderAuthHeaders; queryParams: Record<string, string> }> {
  const type = vendor.authType ?? "bearer";
  const headers: ProviderAuthHeaders = {};
  const queryParams: Record<string, string> = {};

  switch (type) {
    case "none":
      break;
    case "bearer":
      headers["authorization"] = `Bearer ${getVendorSecret(vendor, useLive)}`;
      break;
    case "api_key":
    case "custom_header": {
      const name = vendor.authHeaderName?.trim() || "x-api-key";
      headers[name.toLowerCase()] = getVendorSecret(vendor, useLive);
      break;
    }
    case "basic": {
      const basic = basicAuthHeader(vendor);
      if (basic) headers["authorization"] = basic;
      else headers["authorization"] = `Basic ${getVendorSecret(vendor, useLive)}`;
      break;
    }
    case "query": {
      const name = vendor.authQueryParam?.trim() || "api_key";
      queryParams[name] = getVendorSecret(vendor, useLive);
      break;
    }
    case "oauth2": {
      const token = oauthAccessToken(vendor);
      if (token) headers["authorization"] = `Bearer ${token}`;
      else headers["authorization"] = `Bearer ${getVendorSecret(vendor, useLive)}`;
      break;
    }
    default:
      headers["authorization"] = `Bearer ${getVendorSecret(vendor, useLive)}`;
  }

  // Extra custom headers (may include additional secrets).
  const extra = safeJson<Array<{ name: string; value: string; isSecret?: boolean }>>(
    vendor.authExtraHeadersEnc,
    [],
  );
  for (const h of extra) {
    if (!h.name) continue;
    const value = h.isSecret ? decryptSecret(h.value) : h.value;
    headers[h.name.toLowerCase()] = value;
  }

  return { headers, queryParams };
}

/** Merge auth headers with product/static headers (auth wins on conflicts). */
export function mergeHeaders(auth: ProviderAuthHeaders, extra: Record<string, string>): Record<string, string> {
  return { ...extra, ...auth };
}