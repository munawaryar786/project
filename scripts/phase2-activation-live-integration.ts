/** Real MongoDB, Redis and BullMQ integration; never run outside sealed CI. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access, unlink } from "node:fs/promises";
import { connect } from "node:net";
import { assertPhase2CiIsolation } from "./phase2-ci-isolation-check";

// This runner is invoked through tsx in a CommonJS package. Keep async work
// in an explicit entry point so the esbuild CJS transform accepts it.
async function main() {
  const mode = process.argv[2];
  assert.ok(["prepare-outage", "assert-outage", "recover-outage", "suite"].includes(mode || ""));
  const runId = process.env.PHASE2_CI_RUN_ID || "";
  assert.match(runId, /^[a-f0-9]{12,32}$/);
  assertPhase2CiIsolation(`drivo_ci_activation_${runId}`);
  
  // No application modules are imported until the isolation check above passes.
  const [{ prisma }, { writeBookingActivationIntent, processBookingActivation }, relay,
    { getOutboxQueue, closeQueues }, { OUTBOX_STATES, MAX_OUTBOX_ATTEMPTS }] = await Promise.all([
      import("../lib/prisma"), import("../lib/booking-activation"), import("../lib/outbox-relay"),
      import("../lib/realtime/queues"), import("../lib/realtime/constants"),
    ]);
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const outboxKey = (bookingId: string) => `booking-activation:${bookingId}`;
  const outageRef = `CI-OUTAGE-${runId}`;
  let serial = 0;
  
  async function waitUntil(label: string, predicate: () => Promise<boolean>, timeoutMs = 70_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await predicate()) return;
      await pause(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function driver() {
    return prisma.driver.create({ data: {
      fullName: "Synthetic CI Driver", phone: `ci-driver-${runId}-${++serial}`,
      status: "ACTIVE", isOnline: true, isOnTrip: false,
      vehicleType: "STANDARD", vehicleCapacity: 4,
      currentLat: 48.1486, currentLng: 17.1077, lastLocationReceivedAt: new Date(),
    } });
  }
  async function booking(kind: "CASH" | "CARD" | "INVOICE", options: {
    scheduled?: boolean; status?: string; ref?: string; driverId?: string;
  } = {}) {
    const passenger = await prisma.passenger.create({ data: {
      phone: `ci-passenger-${runId}-${randomUUID()}`, fullName: "Synthetic CI Passenger",
      phoneVerified: true, status: "ACTIVE",
    } });
    const row = await prisma.booking.create({ data: {
      bookingRef: options.ref || `CI-${runId}-${randomUUID()}`,
      status: options.status || "CONFIRMED", dispatchStatus: "NOT_STARTED",
      serviceType: "STANDARD", pickupAddress: "Synthetic CI pickup",
      dropoffAddress: "Synthetic CI destination", pickupLat: 48.1486, pickupLng: 17.1077,
      // A future legacy date would make even scheduledRide:false look scheduled.
      dropoffLat: 48.1500, dropoffLng: 17.1100,
      scheduledDate: options.scheduled ? "2030-01-01" : new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10),
      scheduledTime: "12:00", scheduledRide: Boolean(options.scheduled),
      pickupAt: options.scheduled ? new Date(Date.now() + 2 * 60 * 60_000) : null,
      customerName: "Synthetic CI Passenger", customerPhone: "+421900000000",
      passengerId: passenger.id, phoneVerified: true, passengerAuthStatus: "AUTHENTICATED",
      passengerAuthCompletedAt: new Date(), bookingSource: "WEB",
      paymentMethod: kind, cashAgreed: kind === "CASH", estimatedPrice: 17.25,
      fareTotalFare: 17.25, driverId: options.driverId || null,
    } });
    if (kind === "CARD" && options.status !== "PENDING") {
      // Existing signed-webhook receipt is authoritative for a paid public ride.
      await prisma.paymentWebhookEvent.create({ data: {
        provider: "STRIPE", providerEventId: `evt_ci_${randomUUID()}`,
        eventType: "checkout.session.completed", bookingId: row.id,
        amountMinor: 1725, currency: "EUR", processingStatus: "PROCESSED",
      } });
    }
    return row;
  }
  async function intent(bookingId: string) {
    await prisma.$transaction(tx => writeBookingActivationIntent(tx, bookingId));
    return prisma.outboxEvent.findUniqueOrThrow({ where: { idempotencyKey: outboxKey(bookingId) } });
  }
  async function state(eventId: string) {
    return prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  }
  async function offers(bookingId: string) {
    return prisma.rideRequest.count({ where: { bookingId } });
  }
  async function enqueue(eventId: string) {
    await relay.relayOutboxOnce(50);
    await waitUntil("real BullMQ activation job", async () => Boolean(await getOutboxQueue().getJob(`outbox-${eventId}`)));
  }
  function startWorker(script: string, extraEnv: Record<string, string> = {}) {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
      cwd: process.cwd(), env: { ...process.env, ...extraEnv }, stdio: "ignore",
    });
    child.once("error", () => { child.kill(); });
    return child;
  }
  async function stopWorker(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    let exited = false;
    const completion = new Promise<void>(resolve => child.once("exit", () => { exited = true; resolve(); }));
    child.kill(signal);
    await Promise.race([completion, pause(8_000)]);
    if (!exited) { child.kill("SIGKILL"); await completion; }
  }
  async function withProductionWorkers<T>(count: number, test: () => Promise<T>) {
    const children = Array.from({ length: count }, () => startWorker("workers/realtime-worker.ts"));
    try { return await test(); }
    finally { await Promise.all(children.map(child => stopWorker(child))); }
  }
  async function publishedWithOneOffer(eventId: string, bookingId: string) {
    await waitUntil("published activation and one offer", async () =>
      (await state(eventId)).state === OUTBOX_STATES.PUBLISHED && (await offers(bookingId)) === 1,
      100_000);
    assert.equal(await offers(bookingId), 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).driverId, null);
  }
  async function crashScenario(point: "before" | "after") {
    const row = await booking("CASH");
    const event = await intent(row.id);
    await enqueue(event.id);
    const marker = `/tmp/drivo-phase2-${randomBytes(8).toString("hex")}.marker`;
    const child = startWorker("scripts/phase2-activation-worker.ts", {
      PHASE2_CRASH_POINT: point, PHASE2_WORKER_MARKER: marker,
    });
    try {
      await waitUntil(`${point} crash marker`, async () => {
        assert.equal(child.exitCode, null, "crash worker exited before test marker");
        return access(marker).then(() => true, () => false);
      });
      if (point === "before") assert.equal(await offers(row.id), 0);
      else assert.equal(await offers(row.id), 1);
    } finally {
      await stopWorker(child, "SIGKILL");
      await unlink(marker).catch(() => undefined);
    }
    await withProductionWorkers(1, () => publishedWithOneOffer(event.id, row.id));
    console.log(`PASS actual BullMQ ${point}-dispatch worker crash and production-worker restart`);
  }
  async function runSuite() {
    assert.equal((await prisma.$runCommandRaw({ hello: 1 }) as { setName?: string }).setName, "rs0");
    const queue = getOutboxQueue();
    assert.ok(Number.isInteger((await queue.getJobCounts("wait")).wait));
    await driver();
    const cash = await booking("CASH");
    const card = await booking("CARD");
    const scheduled = await booking("CASH", { scheduled: true });
    const terminal = await booking("CASH", { status: "CANCELLED" });
    const unpaid = await booking("CARD", { status: "PENDING" });
    const invoice = await booking("INVOICE");
    const rows = await Promise.all([cash, card, scheduled, terminal, unpaid, invoice].map(row => intent(row.id)));
    const [cashEvent, cardEvent, scheduledEvent, terminalEvent, unpaidEvent, invoiceEvent] = rows;
    const cashCollectionBefore = await prisma.cashCollection.count();
    const earningsBefore = await prisma.driverEarning.count();
    const ledgerBefore = await prisma.driverLedgerEntry.count();
    await relay.relayOutboxOnce(50);
    await withProductionWorkers(1, async () => {
      await Promise.all([
        publishedWithOneOffer(cashEvent.id, cash.id),
        publishedWithOneOffer(cardEvent.id, card.id),
        waitUntil("scheduled activation published", async () => (await state(scheduledEvent.id)).state === OUTBOX_STATES.PUBLISHED),
        waitUntil("terminal activation published", async () => (await state(terminalEvent.id)).state === OUTBOX_STATES.PUBLISHED),
        waitUntil("unpaid CARD rejected", async () => (await state(unpaidEvent.id)).state === OUTBOX_STATES.RETRY),
        waitUntil("INVOICE rejected", async () => (await state(invoiceEvent.id)).state === OUTBOX_STATES.RETRY),
      ]);
    });
    for (const row of [scheduled, terminal, unpaid, invoice]) assert.equal(await offers(row.id), 0);
    // These deliberately invalid events have proved the production worker's
    // rejection path. Retire only their synthetic retries before later scenarios
    // so the suite tests one recovery condition at a time.
    for (const event of [unpaidEvent, invoiceEvent]) {
      await prisma.outboxEvent.update({ where: { id: event.id }, data: {
        state: OUTBOX_STATES.FAILED, nextAttemptAt: null, lastError: "ci_expected_ineligible",
      } });
      const rejectedJob = await queue.getJob(`outbox-${event.id}`);
      if (rejectedJob) await rejectedJob.remove();
    }
    assert.equal(await prisma.cashCollection.count(), cashCollectionBefore);
    assert.equal(await prisma.driverEarning.count(), earningsBefore);
    assert.equal(await prisma.driverLedgerEntry.count(), ledgerBefore);
    await processBookingActivation(cash.id);
    await processBookingActivation(card.id);
    assert.equal(await offers(cash.id), 1);
    assert.equal(await offers(card.id), 1);
    assert.equal((await queue.add("deliver", { outboxEventId: cashEvent.id }, { jobId: `outbox-${cashEvent.id}` })).id, `outbox-${cashEvent.id}`);
    assert.equal(await offers(cash.id), 1);
    console.log("PASS CASH/CARD activation, scheduled/terminal/ineligible guards, duplicate delivery and unchanged collection/earnings");
  
    const race = await booking("CASH");
    const raceEvent = await intent(race.id);
    await enqueue(raceEvent.id);
    await withProductionWorkers(2, () => publishedWithOneOffer(raceEvent.id, race.id));
    assert.equal(await prisma.rideRequest.count({ where: { bookingId: race.id, status: "PENDING" } }), 1);
    console.log("PASS two production BullMQ workers create one offer and no assignment");
  
    const missing = await booking("CASH");
    const missingEvent = await intent(missing.id);
    await enqueue(missingEvent.id);
    const missingJob = await queue.getJob(`outbox-${missingEvent.id}`);
    assert.ok(missingJob);
    await missingJob.remove();
    await prisma.outboxEvent.update({ where: { id: missingEvent.id }, data: { claimedAt: new Date(Date.now() - 12 * 60_000) } });
    const repaired = await relay.reconcileQueuedOutboxOnce(25);
    assert.ok(repaired.recovered >= 1);
    await enqueue(missingEvent.id);
    await withProductionWorkers(1, () => publishedWithOneOffer(missingEvent.id, missing.id));
    console.log("PASS missing BullMQ activation job is recovered once");
  
    await crashScenario("before");
    await crashScenario("after");
  
    const exhausted = await booking("CASH");
    const exhaustedEvent = await intent(exhausted.id);
    await prisma.outboxEvent.update({ where: { id: exhaustedEvent.id }, data: {
      state: OUTBOX_STATES.QUEUED, attempts: MAX_OUTBOX_ATTEMPTS,
      claimedAt: new Date(Date.now() - 12 * 60_000),
    } });
    await relay.reconcileQueuedOutboxOnce(25);
    assert.equal((await state(exhaustedEvent.id)).state, OUTBOX_STATES.FAILED);
    assert.equal((await state(exhaustedEvent.id)).lastError, "queued_job_missing_retry_limit");
    console.log("PASS exhausted outbox activation is visible as FAILED");
  
    // Acceptance is deliberately last: its own synthetic email outbox event must
    // never be consumed by another worker in this activation-only test database.
    const [{ acceptDriverOfferAtomically }, offer] = await Promise.all([
      import("../lib/driver-operations"),
      prisma.rideRequest.findFirstOrThrow({ where: { bookingId: cash.id } }),
    ]);
    const accepted = await acceptDriverOfferAtomically({ offerId: offer.id, driverId: offer.driverId });
    assert.equal(accepted.ok, true);
    const assigned = await prisma.booking.findUniqueOrThrow({ where: { id: cash.id } });
    assert.equal(assigned.driverId, offer.driverId);
    assert.ok(assigned.acceptedAt);
    assert.equal((await acceptDriverOfferAtomically({ offerId: offer.id, driverId: offer.driverId })).ok, false);
    assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `offer-accepted:${offer.id}` } }), 1);
    console.log("PASS one confirmed assignment under acceptance retry");
    assert.equal(await prisma.emailDelivery.count(), 0, "no email delivery record may be created by activation CI");
    console.log("PASS sealed Phase 2 activation/production-worker integration suite");
  }
  
  try {
    if (mode === "prepare-outage") {
      await driver();
      const row = await booking("CASH", { ref: outageRef });
      const event = await intent(row.id);
      assert.equal(event.state, OUTBOX_STATES.PENDING);
      console.log("PASS activation intent committed before Redis availability");
    } else if (mode === "assert-outage") {
      await new Promise<void>((resolve, reject) => {
        const socket = connect({ host: "127.0.0.1", port: 6379, timeout: 1_500 });
        socket.once("connect", () => { socket.destroy(); reject(new Error("Redis was unexpectedly reachable")); });
        socket.once("timeout", () => { socket.destroy(); resolve(); });
        socket.once("error", () => resolve());
      });
      const row = await prisma.booking.findUniqueOrThrow({ where: { bookingRef: outageRef } });
      const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { idempotencyKey: outboxKey(row.id) } });
      assert.equal(event.state, OUTBOX_STATES.PENDING);
      assert.equal(await offers(row.id), 0);
      console.log("PASS Redis outage did not erase the committed MongoDB activation intent");
    } else if (mode === "recover-outage") {
      const row = await prisma.booking.findUniqueOrThrow({ where: { bookingRef: outageRef } });
      const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { idempotencyKey: outboxKey(row.id) } });
      await enqueue(event.id);
      await withProductionWorkers(1, () => publishedWithOneOffer(event.id, row.id));
      console.log("PASS restored Redis/BullMQ processed the committed activation intent");
    } else await runSuite();
  } finally {
    await closeQueues();
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL isolated Phase 2 activation integration", error);
  process.exitCode = 1;
});
