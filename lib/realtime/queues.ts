import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/realtime/redis";
import { REALTIME_QUEUES } from "@/lib/realtime/constants";
let outboxQueue: Queue | null = null; let expiryQueue: Queue | null = null; let scheduledQueue: Queue | null = null;
export function getOutboxQueue() { return outboxQueue ||= new Queue(REALTIME_QUEUES.OUTBOX, { connection: createRedisConnection("bull-outbox") as any, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false } }); }
export function getOfferExpiryQueue() { return expiryQueue ||= new Queue(REALTIME_QUEUES.OFFER_EXPIRY, { connection: createRedisConnection("bull-expiry") as any, defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false } }); }
export function getScheduledRideQueue() { return scheduledQueue ||= new Queue(REALTIME_QUEUES.SCHEDULED_RIDES, { connection: createRedisConnection("bull-scheduled") as any, defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false } }); }
export async function closeQueues() { await Promise.all([outboxQueue?.close(), expiryQueue?.close(), scheduledQueue?.close()]); outboxQueue = null; expiryQueue = null; scheduledQueue = null; }
