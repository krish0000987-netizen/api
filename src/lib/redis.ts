import { Redis } from "@upstash/redis";

// Upstash Redis (REST) for rate limiting and real-time usage counters.
// Optional: until UPSTASH_REDIS_REST_URL / _TOKEN are set, features that
// depend on Redis degrade gracefully instead of failing.
const configured =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

export const redis = configured ? Redis.fromEnv() : null;
