import { prisma } from "@/lib/prisma";
import { MAX_OUTBOX_ATTEMPTS, OUTBOX_STATES } from "@/lib/realtime/constants";
import { getOutboxQueue } from "@/lib/realtime/queues";

const LEASE_MS = 60_000;
export async function claimOutboxBatch(limit = 50) {
  const now = new Date(); const stale = new Date(now.getTime() - LEASE_MS);
  const candidates = await prisma.outboxEvent.findMany({ where: { OR: [{ state: OUTBOX_STATES.PENDING, attempts: { lt: MAX_OUTBOX_ATTEMPTS } }, { state: OUTBOX_STATES.RETRY, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { state: OUTBOX_STATES.PROCESSING, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, claimedAt: { lt: stale } }] }, orderBy: { createdAt: "asc" }, take: limit });
  const claimed: any[] = [];
  for (const event of candidates) { const changed = await prisma.outboxEvent.updateMany({ where: { id: event.id, OR: [{ state: event.state }, { state: OUTBOX_STATES.PROCESSING, attempts: { lt: MAX_OUTBOX_ATTEMPTS }, claimedAt: { lt: stale } }] }, data: { state: OUTBOX_STATES.PROCESSING, claimedAt: now, attempts: { increment: 1 } } }); if (changed.count === 1) claimed.push(event); }
  return claimed;
}
export async function enqueueOutboxEvent(event: { id: string }) { const queue = getOutboxQueue(); await queue.add("deliver", { outboxEventId: event.id }, { jobId: `outbox-${event.id}` }); await prisma.outboxEvent.updateMany({ where: { id: event.id, state: OUTBOX_STATES.PROCESSING }, data: { state: OUTBOX_STATES.QUEUED } }); }
export async function relayOutboxOnce(limit = 50) { await prisma.outboxEvent.updateMany({ where: { state: { in: [OUTBOX_STATES.PENDING, OUTBOX_STATES.RETRY, OUTBOX_STATES.PROCESSING] }, attempts: { gte: MAX_OUTBOX_ATTEMPTS } }, data: { state: OUTBOX_STATES.FAILED, lastError: "retry_limit_exceeded", claimedAt: null } }); const claimed = await claimOutboxBatch(limit); let queued = 0; for (const event of claimed) { try { await enqueueOutboxEvent(event); queued++; } catch (error) { await prisma.outboxEvent.updateMany({ where: { id: event.id }, data: { state: OUTBOX_STATES.RETRY, lastError: "queue_enqueue_failed", nextAttemptAt: new Date(Date.now() + 5000) } }); } } return { claimed: claimed.length, queued }; }
export async function reconcileOutbox() { return relayOutboxOnce(100); }
