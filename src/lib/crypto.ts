import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Vendor API keys are encrypted at rest with AES-256-GCM. The key is derived
// from the server-only ENCRYPTION_KEY env var (never exposed to the client).
// GCM also authenticates the ciphertext, so tampering is detected.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is not set. Add it to your .env file (see .env.example).");
  }
  // Any length works; sha256 always yields a 256-bit AES key.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1") throw new Error("Unsupported ciphertext version");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// Non-reversible fingerprint used only for masked display in the admin UI,
// so the real key never appears in any response, page, or log.
export function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}
