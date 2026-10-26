/** Disposable crash-point worker. The normal-path smoke runs the production worker. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { assertPhase2CiIsolation } from "./phase2-ci-isolation-check";

// Keep top-level await inside an explicit entry point for the CommonJS tsx transform.
async function main() {
assertPhase2CiIsolation();
assert.ok(["before", "after"].includes(process.env.PHASE2_CRASH_POINT || ""));
assert.match(process.env.PHASE2_WORKER_MARKER || "", /^\/tmp\/drivo-phase2-[a-f0-9]{12,32}\.marker$/);

const [{ Worker }, { prisma }, { createRedisConnection, closeRedis }, { REALTIME_QUEUES }, { processBookingActivation }] = await Promise.all([
  import("bullmq"), import("../lib/prisma"), import("../lib/realtime/redis"),
  import("../lib/realtime/constants"), import("../lib/booking-activation"),
]);
const connection = createRedisConnection("phase2-ci-crash-worker");
const worker = new Worker<{ outboxEventId: string }>(REALTIME_QUEUES.OUTBOX, async job => {
  const event = await prisma.outboxEvent.findUnique({ where: { id: job.data.outboxEventId } });
  assert.equal(event?.eventType, "BOOKING_ACTIVATION_REQUESTED");
  if (process.env.PHASE2_CRASH_POINT === "before") {
    await writeFile(process.env.PHASE2_WORKER_MARKER!, "before");
    await new Promise(() => undefined); // Parent deliberately SIGKILLs this worker.
  }
  await processBookingActivation(event.aggregateId);
  await writeFile(process.env.PHASE2_WORKER_MARKER!, "after");
  await new Promise(() => undefined);
}, { connection: connection as any, concurrency: 1, lockDuration: 3_000, stalledInterval: 2_000 });

worker.on("error", () => { process.exitCode = 1; });
process.once("SIGTERM", () => { void worker.close(true).finally(async () => {
  await closeRedis(connection);
  await prisma.$disconnect();
}); });
}

main().catch(error => {
  console.error("FAIL isolated Phase 2 crash worker initialization", error);
  process.exitCode = 1;
});
