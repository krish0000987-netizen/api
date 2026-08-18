import { createGatewayHandler } from "@/lib/gateway";

// Version 1 of the public gateway. Versioned routes allow admin to publish
// breaking API changes as /api/v2/... without disturbing v1 customers
// (section 26).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createGatewayHandler("v1");

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;