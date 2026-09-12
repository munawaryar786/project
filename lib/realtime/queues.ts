import { Queue } from "bullmq";
import { createRedisConnection } from "@/lib/realtime/redis";
import { REALTIME_QUEUES } from "@/lib/realtime/constants";
let outboxQueue: Queue | null = null; let expiryQueue: Queue | null = null;
export function getOutboxQueue() { return outboxQueue ||= new Queue(REALTIME_QUEUES.OUTBOX, { connection: createRedisConnection("bull-outbox") as any, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false } }); }
export function getOfferExpiryQueue() { return expiryQueue ||= new Queue(REALTIME_QUEUES.OFFER_EXPIRY, { connection: createRedisConnection("bull-expiry") as any, defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false } }); }
export async function closeQueues() { await Promise.all([outboxQueue?.close(), expiryQueue?.close()]); outboxQueue = null; expiryQueue = null; }
