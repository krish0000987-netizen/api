import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSameOrigin } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

// Create a secondary API key for the signed-in customer (section 8).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  let body: { name?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
  const mode = body.mode === "live" ? "live" : body.mode === "sandbox" ? "sandbox" : null;
  if (!mode) return NextResponse.json({ error: "Mode must be sandbox or live" }, { status: 400 });

  const { apiKey, hash, lookup, masked } = await generateApiKey(mode as "sandbox" | "live");
  const row = await prisma.customerApiKey.create({
    data: {
      customerId: session.user.id,
      name,
      apiKeyHash: hash,
      apiKeyLookup: lookup,
      apiKeyPrefix: masked,
      mode,
      status: "active",
    },
    select: { id: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: "customer.key.created",
    entity: "customer",
    entityId: session.user.id,
    details: `mode=${mode}, name=${name ?? "unnamed"}`,
  });

  return NextResponse.json({ ok: true, id: row.id, apiKey, masked });
}