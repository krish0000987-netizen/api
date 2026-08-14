import { redis } from "@/lib/redis";

const WINDOW_MS = 60_000;

export function defaultRateLimit(): number {
  const raw = process.env.RATE_LIMIT_PER_MINUTE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

// True sliding-window counter: keep the timestamps of recent requests in a
// sorted set and count those inside the window. Returns false when the limit
// is exceeded. Skipped entirely when Redis isn't configured.
export async function checkRateLimit(customerId: string, limit: number): Promise<boolean> {
  if (!redis) return true;

  const key = `rl:${customerId}`;
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - WINDOW_MS);
  pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` });
  pipeline.zcard(key);
  pipeline.expire(key, Math.ceil(WINDOW_MS / 1000));

  const results = await pipeline.exec();
  const count = Number(results[2] ?? 0);
  return count <= limit;
}

// Real-time per-day usage counter (separate buckets per sandbox/live mode).
// Kept ~8 days so the nightly cron can aggregate into Postgres.
export async function incrementUsageCounter(customerId: string, mode: string): Promise<void> {
  if (!redis) return;
  const date = new Date().toISOString().slice(0, 10);
  const key = `usage:${customerId}:${mode}:${date}`;
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, 60 * 60 * 24 * 8);
  await pipeline.exec();
}
