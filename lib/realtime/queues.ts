import { Queue } from "bullmq";
import type Redis from "ioredis";
import { createRedisConnection } from "@/lib/realtime/redis";
import { REALTIME_QUEUES } from "@/lib/realtime/constants";

// BullMQ does not own an ioredis instance supplied as an external connection.
// Keep the instances alongside their queues so shutdown can close both.
let outboxQueue: Queue | null = null;
let expiryQueue: Queue | null = null;
let scheduledQueue: Queue | null = null;
let outboxRedis: Redis | null = null;
let expiryRedis: Redis | null = null;
let scheduledRedis: Redis | null = null;

export function getOutboxQueue() {
  if (!outboxQueue) {
    outboxRedis = createRedisConnection("bull-outbox");
    outboxQueue = new Queue(REALTIME_QUEUES.OUTBOX, {
      connection: outboxRedis as any,
      defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false },
    });
  }
  return outboxQueue;
}

export function getOfferExpiryQueue() {
  if (!expiryQueue) {
    expiryRedis = createRedisConnection("bull-expiry");
    expiryQueue = new Queue(REALTIME_QUEUES.OFFER_EXPIRY, {
      connection: expiryRedis as any,
      defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false },
    });
  }
  return expiryQueue;
}

export function getScheduledRideQueue() {
  if (!scheduledQueue) {
    scheduledRedis = createRedisConnection("bull-scheduled");
    scheduledQueue = new Queue(REALTIME_QUEUES.SCHEDULED_RIDES, {
      connection: scheduledRedis as any,
      defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 1000 }, removeOnFail: false },
    });
  }
  return scheduledQueue;
}

export async function closeQueues() {
  const connections = [outboxRedis, expiryRedis, scheduledRedis];
  try {
    await Promise.all([outboxQueue?.close(), expiryQueue?.close(), scheduledQueue?.close()]);
  } finally {
    // A Queue.close() does not disconnect externally supplied ioredis clients.
    // Disconnect after queue shutdown even if one close fails.
    for (const connection of connections) connection?.disconnect();
    outboxQueue = null;
    expiryQueue = null;
    scheduledQueue = null;
    outboxRedis = null;
    expiryRedis = null;
    scheduledRedis = null;
  }
}
