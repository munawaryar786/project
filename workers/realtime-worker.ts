import { Worker, type Job } from "bullmq";
import { Emitter } from "@socket.io/redis-emitter";
import { prisma } from "@/lib/prisma";
import { advanceDispatch, startScheduledRecoveryDispatch } from "@/lib/automatic-dispatch";
import { processScheduledRideJob, reconcileScheduledRideJobs } from "@/lib/scheduled-jobs";
import { createNotification, notificationDedupe } from "@/lib/notifications";
import { createRedisConnection, closeRedis } from "@/lib/realtime/redis";
import { eventTypeForDomain, safeEvent } from "@/lib/realtime/contracts";
import { OUTBOX_STATES, REALTIME_EVENTS, REALTIME_QUEUES } from "@/lib/realtime/constants";
import { getOfferExpiryQueue, getScheduledRideQueue, closeQueues } from "@/lib/realtime/queues";
import { relayOutboxOnce } from "@/lib/outbox-relay";

const redis = createRedisConnection("worker-emitter");
const emitter = new Emitter(redis as any);
function payloadOf(event: any) { return (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, any>; }
async function signal(event: any, recipientType: "DRIVER" | "ADMIN" | "PASSENGER", recipientId: string, stateHint?: string) { const type = eventTypeForDomain(event.eventType); emitter.of(`/${recipientType.toLowerCase()}`).to(`${recipientType.toLowerCase()}:${recipientId}`).emit(type, safeEvent({ eventId: event.id, type, entityId: event.aggregateId, stateHint, actorType: recipientType })); }
async function routeEvent(event: any) {
  const p = payloadOf(event); const bookingId = String(p.bookingId || event.aggregateId); const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { driverId: true, passengerId: true } });
  if (event.eventType === "OFFER_CREATED" && p.driverId) { await createNotification({ recipientType: "DRIVER", recipientId: String(p.driverId), type: "DRIVER_OFFER_UPDATED", data: { bookingId, offerId: String(p.offerId || "") }, dedupeKey: notificationDedupe(event.id, "DRIVER", String(p.driverId)) }); await signal(event, "DRIVER", String(p.driverId), "offer-updated"); const offer = p.offerId ? await prisma.rideRequest.findUnique({ where: { id: String(p.offerId) }, select: { expiresAt: true } }) : null; if (offer) { const delay = Math.max(0, offer.expiresAt.getTime() - Date.now()); await getOfferExpiryQueue().add("expire", { offerId: String(p.offerId), bookingId }, { jobId: `offer-expiry-${String(p.offerId)}`, delay }); } return; }
  if (event.eventType === "DISPATCH_EXHAUSTED") { const admins = await prisma.adminUser.findMany({ select: { id: true } }); for (const admin of admins) { await createNotification({ recipientType: "ADMIN", recipientId: admin.id, type: "DISPATCH_EXHAUSTED", data: { bookingId }, dedupeKey: notificationDedupe(event.id, "ADMIN", admin.id) }); await signal(event, "ADMIN", admin.id, "manual-attention"); } return; }
  if (booking?.driverId) await signal(event, "DRIVER", booking.driverId, event.eventType.toLowerCase());
  if (booking?.passengerId) await signal(event, "PASSENGER", booking.passengerId, event.eventType.toLowerCase());
  const admins = await prisma.adminUser.findMany({ select: { id: true } }); for (const admin of admins) await signal(event, "ADMIN", admin.id, event.eventType.toLowerCase());
}
async function processOutbox(job: Job<{ outboxEventId: string }>) {
  const event = await prisma.outboxEvent.findUnique({ where: { id: job.data.outboxEventId } }); if (!event) return;
  if (event.state === OUTBOX_STATES.PUBLISHED) return;
  try { await routeEvent(event); await prisma.outboxEvent.updateMany({ where: { id: event.id, state: { in: [OUTBOX_STATES.QUEUED, OUTBOX_STATES.PROCESSING, OUTBOX_STATES.RETRY] } }, data: { state: OUTBOX_STATES.PUBLISHED, publishedAt: new Date(), claimedAt: null, lastError: null } }); console.info("[worker.outbox.published]", { eventId: event.id, eventType: event.eventType }); }
  catch (error) { await prisma.outboxEvent.updateMany({ where: { id: event.id }, data: { state: OUTBOX_STATES.RETRY, nextAttemptAt: new Date(Date.now() + 5000), lastError: "processing_failed" } }); throw error; }
}
async function processExpiry(job: Job<{ offerId: string; bookingId: string }>) {
  const offer = await prisma.rideRequest.findUnique({ where: { id: job.data.offerId }, select: { status: true, expiresAt: true, bookingId: true } }); if (!offer || offer.status !== "PENDING") return;
  if (offer.expiresAt.getTime() > Date.now()) { await getOfferExpiryQueue().add("expire", job.data, { jobId: `offer-expiry-${job.data.offerId}-rescheduled`, delay: offer.expiresAt.getTime() - Date.now() }); return; }
  const booking = await prisma.booking.findUnique({ where: { id: offer.bookingId }, select: { scheduledRide: true } });
  const result = booking?.scheduledRide ? await startScheduledRecoveryDispatch(offer.bookingId) : await advanceDispatch(offer.bookingId); console.info("[worker.offer-expiry]", { offerId: job.data.offerId, bookingId: offer.bookingId, outcome: result.ok ? (result as any).outcome : (result as any).code });
}
const outboxWorker = new Worker(REALTIME_QUEUES.OUTBOX, processOutbox, { connection: createRedisConnection("worker-outbox") as any, concurrency: 5 });
const expiryWorker = new Worker(REALTIME_QUEUES.OFFER_EXPIRY, processExpiry, { connection: createRedisConnection("worker-expiry") as any, concurrency: 5 });
const scheduledWorker = new Worker(REALTIME_QUEUES.SCHEDULED_RIDES, processScheduledRideJob, { connection: createRedisConnection("worker-scheduled") as any, concurrency: 5 });
outboxWorker.on("failed", (job, error) => console.error("[worker.outbox.failed]", { jobId: job?.id, message: "job_failed" }));
expiryWorker.on("failed", (job, error) => console.error("[worker.expiry.failed]", { jobId: job?.id, message: "job_failed" }));
scheduledWorker.on("failed", (job, error) => console.error("[worker.scheduled.failed]", { jobId: job?.id, message: "job_failed" }));
console.info("[worker.start]", { queues: Object.values(REALTIME_QUEUES) });
const relayTimer = setInterval(() => void relayOutboxOnce().catch((error) => console.error("[worker.relay.failed]", { message: "relay_failed" })), 2000);
const reconcileTimer = setInterval(() => void reconcileExpired().catch((error) => console.error("[worker.expiry-reconcile.failed]", { message: "expiry_reconcile_failed" })), 30000);
async function reconcileExpired() { await reconcileScheduledRideJobs().catch(() => 0); const rows = await prisma.rideRequest.findMany({ where: { status: "PENDING", expiresAt: { lte: new Date() } }, select: { bookingId: true }, take: 100 }); for (const row of rows) await advanceDispatch(row.bookingId); await relayOutboxOnce(100); }
async function shutdown(signal: string) { console.info("[worker.stop]", { signal }); clearInterval(relayTimer); clearInterval(reconcileTimer); await outboxWorker.close(); await expiryWorker.close(); await scheduledWorker.close(); await closeQueues(); await closeRedis(redis); process.exit(0); }
process.once("SIGTERM", () => void shutdown("SIGTERM")); process.once("SIGINT", () => void shutdown("SIGINT"));
