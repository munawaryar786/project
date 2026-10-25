/**
 * Drivo outbox integration suite: real Prisma MongoDB + real Redis/BullMQ,
 * invoking the actual production outbox-relay module. No worker is started:
 * this suite cannot send emails, dispatch drivers, or emit Socket.IO signals.
 * Run ONLY in a fresh isolated CI environment. No production credentials.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

function verifyIsolation() {
  assert.equal(process.env.CI, "true", "CI=true is required");
  assert.equal(process.env.DRIVO_CI_INTEGRATION, "YES_I_AM_USING_EPHEMERAL_DB", "explicit CI acknowledgment required");
  const rawDb = process.env.DATABASE_URL;
  const rawRedis = process.env.REDIS_URL;
  assert.ok(rawDb && rawRedis, "DATABASE_URL and REDIS_URL are required");
  const mongo = new URL(rawDb);
  const redis = new URL(rawRedis);
  assert.equal(mongo.protocol, "mongodb:");
  assert.equal(mongo.hostname, "127.0.0.1");
  assert.equal(mongo.port, "27017");
  assert.equal(mongo.pathname, "/drivo_ci_outbox");
  assert.equal(mongo.searchParams.get("replicaSet"), "rs0");
  assert.equal(mongo.searchParams.get("directConnection"), "true");
  assert.equal(redis.protocol, "redis:");
  assert.equal(redis.hostname, "127.0.0.1");
  assert.equal(redis.port, "6379");
  assert.equal(process.env.REDIS_HOST, "127.0.0.1");
  assert.equal(process.env.REDIS_PORT, "6379");
  assert.equal(mongo.username, "");
  assert.equal(mongo.password, "");
  assert.equal(redis.username, "");
  assert.equal(redis.password, "");
  // These credentials must NEVER be used for remote or shared databases.
}

async function main() {
  verifyIsolation(); // Always validate before importing database and queue modules.
  const { prisma } = await import("../lib/prisma");
  const { getOutboxQueue, closeQueues } = await import("../lib/realtime/queues");
  const { OUTBOX_STATES, MAX_OUTBOX_ATTEMPTS } = await import("../lib/realtime/constants");
  const { claimOutboxBatch, enqueueOutboxEvent, reconcileQueuedOutboxOnce, relayOutboxOnce } = await import("../lib/outbox-relay");
  const queue = getOutboxQueue();
  const ids: string[] = [];
  const logicalKeys: string[] = [];
  const runId = randomUUID();
  const oldClaim = () => new Date(Date.now() - 12 * 60_000);
  const recentClaim = () => new Date();
  let passed = 0;

  async function seed(type: string, opts: {
    state?: string; attempts?: number; claimedAt?: Date | null;
    payload?: Prisma.InputJsonValue; nextAttemptAt?: Date | null;
    idempotencyKey?: string;
  } = {}) {
    const event = await prisma.outboxEvent.create({ data: {
      eventType: type,
      aggregateType: "CI_OUTBOX",
      aggregateId: runId,
      idempotencyKey: opts.idempotencyKey || `ci:${runId}:${randomUUID()}`,
      payload: opts.payload || { ci: true },
      state: opts.state || OUTBOX_STATES.QUEUED,
      attempts: opts.attempts ?? 1,
      claimedAt: opts.claimedAt === undefined ? oldClaim() : opts.claimedAt,
      nextAttemptAt: opts.nextAttemptAt === undefined ? null : opts.nextAttemptAt,
    }});
    ids.push(event.id);
    return event;
  }
  async function refresh(id: string) {
    const event = await prisma.outboxEvent.findUnique({ where: { id } });
    assert.ok(event, "expected test outbox event");
    return event;
  }
  async function run(label: string, body: () => Promise<void>) {
    try { await body(); passed++; console.log(`PASS ${label}`); }
    catch (error) { console.error(`FAIL ${label}`); throw error; }
  }
  try {
    await prisma.$connect();
    const hello = await prisma.$runCommandRaw({ hello: 1 }) as Record<string, unknown>;
    assert.equal(hello.setName, "rs0", "CI MongoDB must be a replica set");
    const counts = await queue.getJobCounts("wait", "active");
    assert.ok(Number.isInteger(counts.wait) && Number.isInteger(counts.active), "CI BullMQ Redis connectivity check failed");
    console.log("PASS isolated MongoDB replica set and BullMQ Redis connections");

    await run("MongoDB unique outbox idempotency index", async () => {
      const key = `ci:${runId}:unique`;
      await seed("SCHEDULED_RIDE_REMINDER", { idempotencyKey: key });
      await assert.rejects(() => seed("SCHEDULED_RIDE_REMINDER", { idempotencyKey: key }));
    });

    await run("young QUEUED event is not recovered", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER", { claimedAt: recentClaim() });
      await reconcileQueuedOutboxOnce(25);
      assert.equal((await refresh(event.id)).state, OUTBOX_STATES.QUEUED);
      assert.ok(!(await queue.getJob(`outbox-${event.id}`)), "missing job must not be queued");
    });

    await run("old missing reminder atomically becomes RETRY", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER");
      const result = await reconcileQueuedOutboxOnce(25);
      assert.ok(result.recovered >= 1);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.RETRY);
      assert.equal(actual.lastError, "queued_job_missing_recovery");
      assert.equal(actual.claimedAt, null);
    });

    await run("RETRY is claimed and enqueued into real BullMQ", async () => {
      const event = await seed("SCHEDULED_READINESS_CHECKED", {
        state: OUTBOX_STATES.RETRY, claimedAt: null,
      });
      await relayOutboxOnce(50);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.QUEUED);
      assert.equal(actual.attempts, 2);
      assert.ok(await queue.getJob(`outbox-${event.id}`), "real BullMQ job must exist");
    });

    await run("retained Redis job is never re-enqueued", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER");
      await queue.add("deliver", { outboxEventId: event.id }, { jobId: `outbox-${event.id}` });
      await reconcileQueuedOutboxOnce(25);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.QUEUED);
      assert.ok(actual.nextAttemptAt && actual.nextAttemptAt.getTime() > Date.now());
      assert.ok(await queue.getJob(`outbox-${event.id}`));
    });

    await run("ambiguous transactional email is flagged, not queued", async () => {
      const event = await seed("TRANSACTIONAL_EMAIL", { payload: { idempotencyKey: `ci:${runId}:unknownemail` }});
      await reconcileQueuedOutboxOnce(25);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.QUEUED);
      assert.equal(actual.lastError, "queued_job_missing_email_manual_review");
      assert.ok(!(await queue.getJob(`outbox-${event.id}`)), "missing job must not be queued");
    });

    await run("SENT email is rerouted for bookkeeping without sending", async () => {
      const logicalKey = `ci:${runId}:sent`;
      await prisma.emailDelivery.create({ data: {
        logicalKey, kind: "CI_TEST", recipient: "ci-only@example.invalid", status: "SENT",
      }});
      logicalKeys.push(logicalKey);
      const event = await seed("TRANSACTIONAL_EMAIL", { payload: { idempotencyKey: logicalKey } });
      await reconcileQueuedOutboxOnce(25);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.RETRY);
      assert.equal(actual.lastError, "queued_email_sent_completion_pending");
      assert.ok(!(await queue.getJob(`outbox-${event.id}`)), "missing job must not be queued");
    });

    await run("dispatch side-effect event is manual-review only", async () => {
      const event = await seed("DISPATCH_EXHAUSTED");
      await reconcileQueuedOutboxOnce(25);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.QUEUED);
      assert.equal(actual.lastError, "queued_job_missing_manual_review");
      assert.ok(!(await queue.getJob(`outbox-${event.id}`)), "missing job must not be queued");
    });

    await run("missing job beyond max outbox claims is FAILED", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER", { attempts: MAX_OUTBOX_ATTEMPTS });
      await reconcileQueuedOutboxOnce(25);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.FAILED);
      assert.equal(actual.lastError, "queued_job_missing_retry_limit");
    });

    await run("two reconciler calls cannot recover one event twice", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER");
      const [a,b] = await Promise.all([
        reconcileQueuedOutboxOnce(25), reconcileQueuedOutboxOnce(25),
      ]);
      assert.equal((await refresh(event.id)).state, OUTBOX_STATES.RETRY);
      assert.equal(a.recovered + b.recovered, 1);
    });

    await run("claim snapshot increments attempt and persists version", async () => {
      const event = await seed("SCHEDULED_RIDE_REMINDER", {
        state: OUTBOX_STATES.PENDING, attempts: 0, claimedAt: null,
      });
      const claimed = await claimOutboxBatch(50);
      const owner = claimed.find(e => e.id === event.id);
      assert.ok(owner, "PENDING test event must be claimed");
      assert.equal(owner.attempts, 1);
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.PROCESSING);
      assert.equal(actual.attempts, 1);
      assert.ok(actual.claimedAt);
      assert.equal(owner.claimedAt?.getTime(), actual.claimedAt?.getTime());
      await enqueueOutboxEvent(owner, { attempts: owner.attempts, claimedAt: owner.claimedAt });
      assert.equal((await refresh(event.id)).state, OUTBOX_STATES.QUEUED);
      assert.ok(await queue.getJob(`outbox-${event.id}`));
    });

    await run("stale enqueue ownership cannot overwrite current MongoDB lease", async () => {
      const original = oldClaim();
      const newer = recentClaim();
      const event = await seed("SCHEDULED_RIDE_REMINDER", {
        state: OUTBOX_STATES.PROCESSING, attempts: 2, claimedAt: newer,
      });
      await enqueueOutboxEvent(event, { attempts: 1, claimedAt: original });
      const actual = await refresh(event.id);
      assert.equal(actual.state, OUTBOX_STATES.PROCESSING);
      assert.equal(actual.attempts, 2);
      assert.equal(actual.claimedAt?.getTime(), newer.getTime());
    });
    console.log(`PASS Drivo real MongoDB/Redis outbox integration suite: ${passed} scenarios`);
    console.log("NOTE: Production worker, Socket.IO delivery, SMTP/Resend, and load testing were NOT exercised.");
  } finally {
    // Only ever delete rows generated by this run; never wipe a DB or queue.
    try {
      for (const id of ids) {
        const job = await queue.getJob(`outbox-${id}`);
        if (job) await job.remove();
      }
      if (ids.length) await prisma.outboxEvent.deleteMany({ where: { id: { in: ids } }});
      if (logicalKeys.length) await prisma.emailDelivery.deleteMany({ where: { logicalKey: { in: logicalKeys } }});
    } finally {
      await closeQueues();
      await prisma.$disconnect();
    }
  }
}

main().catch(error => { console.error("FAIL Drivo MongoDB/Redis integration", error); process.exitCode = 1; });
