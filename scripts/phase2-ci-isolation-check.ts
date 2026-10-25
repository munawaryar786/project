/** Fail closed before importing Prisma, Redis, a queue, or the worker. */
import assert from "node:assert/strict";

export function assertPhase2CiIsolation(expectedDatabase?: string) {
  assert.equal(process.env.CI, "true");
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.DRIVO_PHASE2_CI, "ISOLATED_INTERNAL_NETWORK");
  assert.equal(process.env.DRIVO_CI_INTEGRATION, "YES_I_AM_USING_EPHEMERAL_DB");
  const database = new URL(process.env.DATABASE_URL || "");
  const redis = new URL(process.env.REDIS_URL || "");
  assert.equal(database.protocol, "mongodb:");
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.port, "27017");
  assert.match(database.pathname, /^\/drivo_ci_(?:activation|outbox)_[a-f0-9]{12,32}$/);
  if (expectedDatabase) assert.equal(database.pathname.slice(1), expectedDatabase);
  assert.equal(database.searchParams.get("replicaSet"), "rs0");
  assert.equal(database.searchParams.get("directConnection"), "true");
  assert.equal(redis.protocol, "redis:");
  assert.equal(redis.hostname, "127.0.0.1");
  assert.equal(redis.port, "6379");
  assert.equal(redis.pathname, "/0");
  assert.equal(process.env.REDIS_HOST, "127.0.0.1");
  assert.equal(process.env.REDIS_PORT, "6379");
  assert.equal(database.username, "");
  assert.equal(database.password, "");
  assert.equal(redis.username, "");
  assert.equal(redis.password, "");
  for (const name of [
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "SMTP_HOST", "SMTP_USER",
    "SMTP_PASS", "SENDGRID_API_KEY", "MAILGUN_API_KEY",
  ]) assert.ok(!process.env[name], `${name} must be absent in activation CI`);
  return database.pathname.slice(1);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/phase2-ci-isolation-check.ts")) {
  assertPhase2CiIsolation();
  console.log("PASS phase2 CI configuration is explicitly disposable and provider-free");
}
