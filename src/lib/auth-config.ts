// Encrypts/decrypts vendor authentication configuration. The whole config
// blob is AES-256-GCM encrypted before it reaches the database so provider
// credentials are never stored (or served) in plaintext.

import { encryptSecret } from "@/lib/crypto";

export type VendorAuthInput = {
  authType?: string | null;
  authHeaderName?: string | null;
  authQueryParam?: string | null;
  authBasic?: { username: string; password: string } | null;
  authExtraHeaders?: Array<{ name: string; value: string; isSecret?: boolean }> | null;
  authOAuth?: {
    tokenUrl?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
    scope?: string | null;
    grantType?: string | null;
  } | null;
};

export type EncryptedAuthConfig = {
  authType: string;
  authHeaderName: string | null;
  authQueryParam: string | null;
  authBasicEnc: string | null;
  authExtraHeadersEnc: string | null;
  authOAuthEnc: string | null;
};

// Encrypt the secret-bearing parts of the auth config into their storage
// columns. Non-secret fields (authType, headerName, queryParam) stay plain so
// they can be listed/rendered without decrypting.
export function encryptAuthConfig(input: VendorAuthInput): EncryptedAuthConfig {
  const authType = input.authType ?? "bearer";
  const authHeaderName = input.authHeaderName ?? null;
  const authQueryParam = input.authQueryParam ?? null;

  let authBasicEnc: string | null = null;
  if (input.authBasic?.username) {
    authBasicEnc = encryptSecret(
      JSON.stringify({
        username: encryptSecret(input.authBasic.username),
        password: input.authBasic.password ? encryptSecret(input.authBasic.password) : "",
      }),
    );
  }

  let authExtraHeadersEnc: string | null = null;
  if (Array.isArray(input.authExtraHeaders)) {
    const wrapped = input.authExtraHeaders.map((h) => ({
      name: h.name,
      value: h.isSecret === false ? h.value : encryptSecret(h.value),
      isSecret: h.isSecret !== false,
    }));
    authExtraHeadersEnc = wrapped.length > 0 ? encryptSecret(JSON.stringify(wrapped)) : null;
  }

  let authOAuthEnc: string | null = null;
  if (input.authOAuth && (input.authOAuth.clientSecret || input.authOAuth.clientId || input.authOAuth.tokenUrl)) {
    const wrapped = {
      ...input.authOAuth,
      clientId: input.authOAuth.clientId ? encryptSecret(input.authOAuth.clientId) : null,
      clientSecret: input.authOAuth.clientSecret ? encryptSecret(input.authOAuth.clientSecret) : null,
    };
    authOAuthEnc = encryptSecret(JSON.stringify(wrapped));
  }

  return { authType, authHeaderName, authQueryParam, authBasicEnc, authExtraHeadersEnc, authOAuthEnc };
}