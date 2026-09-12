import Redis from "ioredis";

const globalForDrivoRedis = globalThis as typeof globalThis & {
  __drivoAuthRateLimitRedis?: Redis;
};

function redisUrl() { return process.env.REDIS_URL?.trim() || null; }
export function redisConfigured() { return Boolean(redisUrl()); }
export function assertProductionRedis() {
  const value = redisUrl();
  if (!value) throw new Error("REDIS_URL is required for realtime workers");
  if (process.env.NODE_ENV === "production" && !value.startsWith("rediss://")) throw new Error("Production realtime requires REDIS_URL using rediss://");
  return value;
}
export function createRedisConnection(role: string) {
  const url = assertProductionRedis();
  const client = new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true, connectionName: `drivo-${role}` });
  client.on("error", (error) => console.error("[realtime.redis.error]", { role, message: "redis_connection_error" }));
  return client;
}
/**
 * Shared server-only auth limiter connection using the existing Phase 3D
 * Redis URL, TLS, authentication, and lifecycle policy.
 */
export function getAuthRateLimitConnection() {
  const current = globalForDrivoRedis.__drivoAuthRateLimitRedis;
  if (current && current.status !== "end") return current;
  const client = createRedisConnection("auth-rate-limit");
  globalForDrivoRedis.__drivoAuthRateLimitRedis = client;
  return client;
}
export function safeRedisStatus(client: Redis | null) { return client?.status === "ready"; }
export async function closeRedis(client?: Redis | null) { if (client && client.status !== "end") await client.quit().catch(() => client.disconnect()); }
