import { prisma } from "@/lib/prisma";
import { MAX_OUTBOX_ATTEMPTS, OUTBOX_STATES } from "@/lib/realtime/constants";
import { getOutboxQueue } from "@/lib/realtime/queues";

const LEASE_MS = 60_000;
// The queue lookup must be authoritative before a QUEUED record is repaired.
// This grace period exceeds the email sender's ownership lease and avoids
// competing with normal BullMQ transitions during a short Redis interruption.
const QUEUED_RECOVERY_GRACE_MS = 10 * 60_000;
const OUTBOX_FINAL_ATTEMPT_GRACE_MS = 3 * 60_000;
const QUEUED_RECOVERY_SCAN_INTERVAL_MS = 60_000;
const QUEUED_RECOVERY_RECHECK_MS = 5 * 60_000;
const QUEUED_MANUAL_REVIEW_MS = 60 * 60_000;
// Only auto-replay events whose route has no irreversible external side effect.
// Expand this set only after each event type has its own idempotency tests.
const QUEUED_AUTO_REPLAY_TYPES = new Set(["SCHEDULED_RIDE_REMINDER", "SCHEDULED_READINESS_CHECKED"]);
let nextQueuedRecoveryScanAt = 0;
let queuedRecoveryCursor: { claimedAt: Date; id: string } | null = null;

type OutboxClaimIdentity = { attempts: number; claimedAt: Date };

export async function claimOutboxBatch(limit = 50) {
  const now = new Date(); const stale = new Date(now.getTime() - LEASE_MS);
  const candidates = await prisma.outboxEvent.findMany({ where: { OR: [{ state: OUTBOX_STATES.PENDING, attempts: { lt: MAX_OUTBOX_ATTEMPTS } }, { state: OUTBOX_STATES.RETRY, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { state: OUTBOX_STATES.PROCESSING, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, claimedAt: { lt: stale } }] }, orderBy: { createdAt: "asc" }, take: limit });
  const claimed: any[] = [];
  for (const event of candidates) {
    // A stale candidate is only a hint. Re-check its eligibility atomically.
    // In particular, PROCESSING claims must still have an expired lease.
    const eligible =
      event.state === OUTBOX_STATES.PROCESSING
        ? { state: OUTBOX_STATES.PROCESSING, claimedAt: { lt: stale } }
        : event.state === OUTBOX_STATES.RETRY
          ? { state: OUTBOX_STATES.RETRY, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }
          : { state: OUTBOX_STATES.PENDING };
    const changed = await prisma.outboxEvent.updateMany({
      where: { id: event.id, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, ...eligible },
      data: { state: OUTBOX_STATES.PROCESSING, claimedAt: now, attempts: { increment: 1 } },
    });
    // The returned snapshot must carry the NEW version, not the stale read.
    if (changed.count === 1) claimed.push({ ...event, attempts: event.attempts + 1, claimedAt: now });
  }
  return claimed;
}
export function outboxRetryOptions(eventType?: string) {
  // Email retries must outlive the two-minute sender lease after a worker crash.
  // Other realtime events retain their existing retry cadence.
  return eventType === "TRANSACTIONAL_EMAIL"
    ? { attempts: 6, backoff: { type: "exponential", delay: 30_000 }, removeOnFail: { count: 1000 } } : {};
}
export async function enqueueOutboxEvent(event: { id: string; eventType?: string }, owner?: OutboxClaimIdentity) {
  const queue = getOutboxQueue();
  const registered = await queue.add("deliver", { outboxEventId: event.id }, { jobId: `outbox-${event.id}`, ...outboxRetryOptions(event.eventType) });
  // Adding the same ID does not restart a retained failed BullMQ job. Repair
  // only this feature's delivery events; email/dispatch retry policy is unchanged.
  if (["SCHEDULED_RIDE_REMINDER", "SCHEDULED_READINESS_CHECKED", "SCHEDULED_READINESS_FAILED"].includes(event.eventType || "") && await registered.getState() === "failed") {
    try { await registered.retry("failed", { resetAttemptsMade: true }); }
    catch (error) {
      const state = await registered.getState();
      if (state === "failed" || state === "unknown") throw error;
    }
  }
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, state: OUTBOX_STATES.PROCESSING, ...(owner ? { attempts: owner.attempts, claimedAt: owner.claimedAt } : {}) },
    data: { state: OUTBOX_STATES.QUEUED },
  });
}

/** Repair only confirmed missing jobs. Existing jobs, including failed/active,
 * are left under BullMQ's normal policy; absence is not inferred from state. */
export async function reconcileQueuedOutboxOnce(limit = 25, now = new Date()) {
  const stale = new Date(now.getTime() - QUEUED_RECOVERY_GRACE_MS);
  const pageSize = Math.min(Math.max(1, limit), 50);
  const rows = await prisma.outboxEvent.findMany({
    where: { AND: [
      { state: OUTBOX_STATES.QUEUED, claimedAt: { lt: stale },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }, { nextAttemptAt: { isSet: false } }] },
      ...(queuedRecoveryCursor ? [{ OR: [
        { claimedAt: { gt: queuedRecoveryCursor.claimedAt } },
        { claimedAt: queuedRecoveryCursor.claimedAt, id: { gt: queuedRecoveryCursor.id } },
      ] }] : []),
    ] },
    orderBy: [{ claimedAt: "asc" }, { id: "asc" }],
    take: pageSize,
    select: { id: true, eventType: true, attempts: true, claimedAt: true, payload: true },
  });
  if (!rows.length) {
    queuedRecoveryCursor = null;
    return { scanned: 0, recovered: 0, needsReview: 0, alreadySent: 0 };
  }
  const queue = getOutboxQueue();
  let recovered = 0, needsReview = 0, alreadySent = 0;
  for (const event of rows) {
    if (!event.claimedAt) continue;
    // Advance the bounded scan even when a row has an existing BullMQ job.
    // Otherwise a large backlog of active jobs could starve later missing jobs.
    queuedRecoveryCursor = { claimedAt: event.claimedAt, id: event.id };
    const where = { id: event.id, state: OUTBOX_STATES.QUEUED, attempts: event.attempts, claimedAt: event.claimedAt };
    // If Redis is unavailable, getJob must throw, not be treated as "missing".
    const existingJob = await queue.getJob(`outbox-${event.id}`);
    if (existingJob) {
      // Even completed/failed retained jobs require their own recovery policy.
      // Never recreate a job whose ID is still present in Redis.
      await prisma.outboxEvent.updateMany({ where, data: { nextAttemptAt: new Date(now.getTime() + QUEUED_RECOVERY_RECHECK_MS) } });
      continue;
    }
    if (event.eventType === "TRANSACTIONAL_EMAIL") {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown> : {};
      const logicalKey = payload.idempotencyKey;
      const delivery = typeof logicalKey === "string"
        ? await prisma.emailDelivery.findUnique({ where: { logicalKey }, select: { status: true } }) : null;
      if (delivery?.status === "SENT") {
        // The provider message is already persisted as SENT. Route through the
        // normal processor again (which skips transport) so post-send bookkeeping,
        // such as payment email status, can complete before PUBLISHED.
        if (event.attempts < MAX_OUTBOX_ATTEMPTS) {
          const done = await prisma.outboxEvent.updateMany({
            where,
            data: { state: OUTBOX_STATES.RETRY, claimedAt: null, nextAttemptAt: now, lastError: "queued_email_sent_completion_pending" },
          });
          alreadySent += done.count;
        } else {
          const flagged = await prisma.outboxEvent.updateMany({
            where,
            data: { lastError: "queued_email_sent_manual_review_retry_limit", nextAttemptAt: new Date(now.getTime() + QUEUED_MANUAL_REVIEW_MS) },
          });
          needsReview += flagged.count;
        }
      } else {
        // SMTP cannot guarantee dedupe after provider acceptance + process crash.
        // Do not blindly send again; surface an explicit operator-review state.
        const flagged = await prisma.outboxEvent.updateMany({
          where,
          data: { lastError: "queued_job_missing_email_manual_review", nextAttemptAt: new Date(now.getTime() + QUEUED_MANUAL_REVIEW_MS) },
        });
        needsReview += flagged.count;
      }
      continue;
    }
    if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
      const failed = await prisma.outboxEvent.updateMany({
        where,
        data: { state: OUTBOX_STATES.FAILED, claimedAt: null, lastError: "queued_job_missing_retry_limit" },
      });
      needsReview += failed.count;
      continue;
    }
    if (!QUEUED_AUTO_REPLAY_TYPES.has(event.eventType)) {
      // Domain events can perform external effects (SMTP, admin escalation,
      // downstream dispatch). Do not replay them without a reviewed policy.
      const flagged = await prisma.outboxEvent.updateMany({
        where,
        data: { lastError: "queued_job_missing_manual_review", nextAttemptAt: new Date(now.getTime() + QUEUED_MANUAL_REVIEW_MS) },
      });
      needsReview += flagged.count;
      continue;
    }
    // The state transition is conditional on the exact claim version. This
    // prevents simultaneous reconcilers or a newer worker from clobbering it.
    const changed = await prisma.outboxEvent.updateMany({
      where,
      data: { state: OUTBOX_STATES.RETRY, claimedAt: null, nextAttemptAt: now, lastError: "queued_job_missing_recovery" },
    });
    recovered += changed.count;
  }
  if (rows.length < pageSize) queuedRecoveryCursor = null;
  return { scanned: rows.length, recovered, needsReview, alreadySent };
}

export async function relayOutboxOnce(limit = 50) {
  const now = new Date();
  const stale = new Date(now.getTime() - OUTBOX_FINAL_ATTEMPT_GRACE_MS);
  // An active final attempt may still succeed; never fail it prematurely.
  await prisma.outboxEvent.updateMany({
    where: { attempts: { gte: MAX_OUTBOX_ATTEMPTS }, OR: [
      { state: { in: [OUTBOX_STATES.PENDING, OUTBOX_STATES.RETRY] } },
      { state: OUTBOX_STATES.PROCESSING, claimedAt: { lt: stale } },
    ] },
    data: { state: OUTBOX_STATES.FAILED, lastError: "retry_limit_exceeded", claimedAt: null },
  });
  // Throttle expensive Redis lookups. Other replicas can run concurrently;
  // per-document compare-and-set prevents duplicate state recovery.
  if (Date.now() >= nextQueuedRecoveryScanAt) {
    nextQueuedRecoveryScanAt = Date.now() + QUEUED_RECOVERY_SCAN_INTERVAL_MS;
    try {
      const recovery = await reconcileQueuedOutboxOnce(Math.min(limit, 25));
      if (recovery.recovered || recovery.needsReview || recovery.alreadySent) console.info("[outbox.queued-recovery]", recovery);
    } catch {
      console.error("[outbox.queued-recovery.failed]", { code: "recovery_unavailable" });
    }
  }
  const claimed = await claimOutboxBatch(limit);
  let queued = 0;
  for (const event of claimed) {
    const owner = { attempts: event.attempts as number, claimedAt: event.claimedAt as Date };
    try {
      await enqueueOutboxEvent(event, owner);
      queued++;
    } catch {
      await prisma.outboxEvent.updateMany({
        where: { id: event.id, state: OUTBOX_STATES.PROCESSING, attempts: owner.attempts, claimedAt: owner.claimedAt },
        data: { state: OUTBOX_STATES.RETRY, claimedAt: null, lastError: "queue_enqueue_failed", nextAttemptAt: new Date(Date.now() + 5000) },
      });
    }
  }
  return { claimed: claimed.length, queued };
}
export async function reconcileOutbox() { return relayOutboxOnce(100); }
