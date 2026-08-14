import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

// Stripe-style branded API keys. The full key is returned to the customer
// exactly once; only its bcrypt hash is stored. The masked display string
// (prefix + last 4) is what the dashboard shows. A sha256 "lookup" hash is
// indexed in the database so the proxy gateway can find the customer by key
// in O(1) before running the bcrypt verification.

export type ApiKeyResult = {
  apiKey: string;
  /** bcrypt hash — the only stored credential. */
  hash: string;
  /** sha256 hex digest, indexed for fast key lookups. */
  lookup: string;
  /** Masked display string, e.g. "sk_test_...aB3f". */
  masked: string;
};

export async function generateApiKey(mode: "sandbox" | "live"): Promise<ApiKeyResult> {
  const prefix = mode === "live" ? "sk_live_" : "sk_test_";
  const random = randomBytes(24).toString("base64url"); // 192 bits of entropy
  const apiKey = prefix + random;
  return {
    apiKey,
    hash: await bcrypt.hash(apiKey, 10),
    lookup: createHash("sha256").update(apiKey).digest("hex"),
    masked: `${prefix}...${random.slice(-4)}`,
  };
}
