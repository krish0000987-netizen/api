import { createGatewayHandler } from "@/lib/gateway";

// Version 2 of the public gateway (section 26). Products may be published at
// /api/v2/{slug} without breaking existing v1 customers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createGatewayHandler("v2");

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;