import { Redis } from "@upstash/redis";

// Upstash Redis (REST) for rate limiting and real-time usage counters.
// Optional: until UPSTASH_REDIS_REST_URL / _TOKEN are set to real values,
// features that depend on Redis degrade gracefully instead of failing.
// Placeholder values from .env.example are treated as "not configured".
function redisConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!url || !token) return false;
  if (url.includes("xxxx") || url.includes("replace-with")) return false;
  if (token.includes("replace-with")) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export const redis = redisConfigured() ? Redis.fromEnv() : null;
