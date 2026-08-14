import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function aggregateFromRedis(): Promise<number> {
  if (!redis) return 0;
  const today = todayString();
  const keys = await redis.keys("usage:*");
  let flushed = 0;

  for (const key of keys) {
    // Key shape: usage:{customerId}:{mode}:{YYYY-MM-DD}
    const [, customerId, mode, date] = key.split(":");
    if (!customerId || !mode || !date) continue;
    // Only flush completed days; today keeps accumulating in Redis.
    if (date >= today) continue;

    const count = (await redis.get<number>(key)) ?? 0;
    await prisma.dailyUsage.upsert({
      where: { customerId_mode_date: { customerId, mode, date: new Date(date) } },
      create: { customerId, mode, date: new Date(date), count },
      update: { count },
    });
    await redis.del(key);
    flushed++;
  }
  return flushed;
}

// Fallback when Upstash isn't configured: aggregate yesterday's usage from the
// per-request UsageEvent rows so the cron still produces DailyUsage data.
async function aggregateFromDatabase(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = await prisma.$queryRaw<Array<{ customerId: string; mode: string; count: number }>>`
    SELECT "customerId", mode, COUNT(*)::int AS count
    FROM "UsageEvent"
    WHERE to_char("createdAt", 'YYYY-MM-DD') = ${yesterday}
    GROUP BY "customerId", mode
  `;

  for (const row of rows) {
    await prisma.dailyUsage.upsert({
      where: { customerId_mode_date: { customerId: row.customerId, mode: row.mode, date: new Date(yesterday) } },
      create: { customerId: row.customerId, mode: row.mode, date: new Date(yesterday), count: row.count },
      update: { count: row.count },
    });
  }
  return rows.length;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const flushed = redis ? await aggregateFromRedis() : await aggregateFromDatabase();
    return NextResponse.json({ ok: true, flushed });
  } catch (error) {
    console.error("Usage aggregation cron failed:", error);
    return NextResponse.json({ ok: false, error: "Aggregation failed" }, { status: 500 });
  }
}
