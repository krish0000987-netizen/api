import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/require-admin";
import { isSameOrigin } from "@/lib/csrf";
import { runProductTest } from "@/lib/product-tester";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

// Universal API Tester (section 6). Admin selects a product + environment and
// the dynamically-generated form is submitted here. Provider secrets never
// leave the server and request headers are masked in the result.
export async function POST(request: Request, { params }: RouteContext) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });

  const { id } = await params;

  let body: { mode?: string; body?: unknown; query?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await runProductTest({
    productId: id,
    mode: body.mode === "live" ? "live" : "sandbox",
    body: body.body ?? {},
    query: body.query ?? {},
  });

  return NextResponse.json({ result });
}