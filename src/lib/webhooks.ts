// Customer webhook delivery (section 16).
//
// When a product call completes (including provider async results surfaced
// through the platform), the gateway posts the sanitized outcome to the
// customer's configured webhooks for that product. Payloads never include
// provider secrets; sensitive values are masked by the response mapping layer
// before they reach this point.

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { generateRequestId } from "@/lib/request-id";

type WebhookPayload = {
  request_id: string;
  api: string;
  success: boolean;
  status: number;
  data: unknown;
  event?: string;
};

export async function deliverWebhooks(
  customerId: string,
  productId: string | null,
  payload: WebhookPayload,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { customerId, enabled: true, ...(productId ? { apiProductId: productId } : {}) },
    });
    if (webhooks.length === 0) return;
    const eventId = generateRequestId("evt");
    const body = JSON.stringify({ ...payload, event_id: eventId });

    for (const hook of webhooks) {
      void deliverOne(hook, body);
    }
  } catch (error) {
    console.error("Webhook lookup failed:", error);
  }
}

async function deliverOne(
  hook: {
    id: string;
    url: string;
    method: string;
    headersEnc: string | null;
    authConfigEnc: string | null;
    signatureSecretEnc: string | null;
    retryCount: number;
    timeoutMs: number;
  },
  body: string,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (hook.headersEnc) {
    try {
      const parsed = JSON.parse(decryptSecret(hook.headersEnc)) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) headers[k.toLowerCase()] = v;
    } catch {
      // ignore malformed headers
    }
  }

  if (hook.authConfigEnc) {
    try {
      const auth = JSON.parse(decryptSecret(hook.authConfigEnc)) as { type?: string; token?: string; headerName?: string; username?: string; password?: string };
      switch (auth.type) {
        case "bearer":
          if (auth.token) headers["authorization"] = `Bearer ${auth.token}`;
          break;
        case "api_key":
          headers[auth.headerName?.toLowerCase() || "x-api-key"] = auth.token ?? "";
          break;
        case "basic":
          if (auth.username) {
            headers["authorization"] = `Basic ${Buffer.from(`${auth.username}:${auth.password ?? ""}`).toString("base64")}`;
          }
          break;
      }
    } catch {
      // ignore malformed auth
    }
  }

  if (hook.signatureSecretEnc) {
    const secret = decryptSecret(hook.signatureSecretEnc);
    const { createHmac } = await import("crypto");
    headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }

  const retries = Math.max(0, hook.retryCount);
  const timeout = Math.max(1000, hook.timeoutMs || 5000);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(hook.url, {
        method: hook.method || "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status >= 200 && res.status < 300) return;
      // 4xx responses are not retryable.
      if (res.status >= 400 && res.status < 500) return;
    } catch {
      // fall through to retry
    }
  }
}