// Executed only against the disposable loopback replica set in phase2-mongo-check.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signBookingPrice } from "@/lib/security/booking-price";
import { createOrReusePaymentCheckout, inspectLegacyPaymentLink, reconcilePaymentOperationsOnce, type CheckoutProvider } from "@/lib/payment-checkout";
import { reservePaymentOperation, publishPaymentSession } from "@/lib/payment-operations";
import { processBookingActivation, writeBookingActivationIntent } from "@/lib/booking-activation";
import { POST as signedStripeWebhook } from "@/app/api/payments/webhook/route";
import { deriveOperationalAlerts } from "@/lib/admin-operations";

const url = new URL(process.env.DATABASE_URL || "");
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/drivo_phase2_test_[a-f0-9]+$/);
assert.equal(process.env.STRIPE_SECRET_KEY, "sk_test_phase2_local_synthetic_only");
assert.equal(process.env.STRIPE_WEBHOOK_SECRET, "whsec_phase2_local_synthetic_only");
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const actorA = "111111111111111111111111";
const actorB = "222222222222222222222222";
let serial = 0;
async function booking(channel: "PUBLIC" | "PHONE_DISPATCH" = "PUBLIC", status = "PENDING") {
  const bookingRef = "PHASE2-" + (++serial);
  return prisma.booking.create({ data: {
    bookingRef, status, serviceType: "STANDARD", pickupAddress: "Test pickup",
    dropoffAddress: "Test destination", scheduledDate: "2026-10-12", scheduledTime: "12:00",
    customerName: "Synthetic", customerPhone: "+421900000000",
    bookingSource: channel === "PUBLIC" ? "WEB" : "PHONE_DISPATCH",
    paymentMethod: "CARD", estimatedPrice: 17.25, fareTotalFare: 17.25,
    fareBreakdown: { serverPriceMac: signBookingPrice(bookingRef, 17.25) },
  } });
}
let providerCreates = 0;
let providerCalls = 0;
const sessions = new Map<string, any>();
const fakeProvider: CheckoutProvider = {
  create: async params => {
    providerCalls++;
    const remaining = (params.expiresAt ?? 0) - Math.floor(Date.now() / 1000);
    if (remaining < 30 * 60 || remaining > 24 * 60 * 60) {
      throw new Error("synthetic Stripe invalid expires_at");
    }
    await pause(45);
    let session = sessions.get(params.idempotencyKey!);
    if (!session) {
      providerCreates++;
      session = {
        id: "cs_test_phase2_" + providerCreates,
        url: "https://checkout.example.test/" + providerCreates,
        status: "open", payment_status: "unpaid",
        metadata: { bookingId: params.bookingId, bookingRef: params.bookingRef,
          operationId: params.operationId, operationGeneration: String(params.operationGeneration),
          paymentChannel: params.paymentChannel },
        amount_total: params.amount, currency: "eur", expires_at: params.expiresAt,
      };
      sessions.set(params.idempotencyKey!, session);
    }
    return { success: true, sessionId: session.id, sessionUrl: session.url };
  },
  get: async sessionId => {
    const session = [...sessions.values()].find(value => value.id === sessionId);
    return session ? { success: true, session, status: session.payment_status, amount: session.amount_total } as any
      : { success: false, error: "missing" } as any;
  },
};

async function deliverSignedWebhook(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`${timestamp}.${payload}`).digest("hex");
  return signedStripeWebhook(new NextRequest("http://127.0.0.1:3000/api/payments/webhook", {
    method: "POST", body: payload,
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  }));
}

async function main() {
  const first = await booking();
  const key = randomUUID();
  const [a, b] = await Promise.all([
    createOrReusePaymentCheckout({ bookingId: first.id, actorId: actorA, channel: "PUBLIC", requestKey: key }, fakeProvider),
    createOrReusePaymentCheckout({ bookingId: first.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID() }, fakeProvider),
  ]);
  assert.ok([a.state, b.state].includes("READY"));
  assert.equal(providerCreates, 1, "concurrent requests create one payable session");
  const replay = await createOrReusePaymentCheckout({ bookingId: first.id, actorId: actorA, channel: "PUBLIC", requestKey: key }, fakeProvider);
  assert.equal(replay.state, "READY");
  assert.equal(providerCreates, 1, "same/different request keys reuse the booking session");
  const slot = await prisma.bookingPaymentSlot.findUniqueOrThrow({ where: { bookingId: first.id } });
  const operation = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: slot.activeOperationId! } });
  assert.equal(operation.generation, 1);
  assert.equal(operation.amountMinor, 1725);
  assert.equal(operation.currency, "EUR");
  assert.equal(operation.actorId, actorA);
  assert.equal(operation.providerSessionId, (replay as any).sessionId);
  assert.ok(operation.providerExpiresAt!.getTime() - operation.providerRequestAt!.getTime() >= 30 * 60_000);
  assert.equal(providerCalls, 1);
  console.log("PASS public double-click and cross-request reuse with one fenced provider Session");

  const second = await booking("PHONE_DISPATCH");
  const competing = await Promise.all([
    createOrReusePaymentCheckout({ bookingId: second.id, actorId: actorA, channel: "PHONE_DISPATCH", requestKey: randomUUID() }, fakeProvider),
    createOrReusePaymentCheckout({ bookingId: second.id, actorId: actorB, channel: "PHONE_DISPATCH", requestKey: randomUUID() }, fakeProvider),
  ]);
  assert.ok(competing.some(result => result.state === "READY"));
  assert.equal(providerCreates, 2);
  const paidSlot = await prisma.bookingPaymentSlot.findUniqueOrThrow({ where: { bookingId: second.id } });
  const dispatchOperation = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: paidSlot.activeOperationId! } });
  const dispatchPayment = await prisma.bookingPayment.findUniqueOrThrow({ where: { providerSessionId: dispatchOperation.providerSessionId! } });
  assert.equal(dispatchPayment.operationId, dispatchOperation.id);
  assert.equal(dispatchPayment.createdByDispatchOperatorId, dispatchOperation.actorId);
  console.log("PASS competing Dispatcher operators cannot steal an active lease");

  const third = await booking();
  let timeoutOnce = true;
  const timeoutProvider: CheckoutProvider = {
    ...fakeProvider,
    create: async params => {
      const created = await fakeProvider.create(params);
      if (timeoutOnce) { timeoutOnce = false; throw new Error("synthetic timeout after provider success"); }
      return created;
    },
  };
  const timeoutKey = randomUUID();
  const uncertain = await createOrReusePaymentCheckout({ bookingId: third.id, actorId: actorA, channel: "PUBLIC", requestKey: timeoutKey }, timeoutProvider);
  assert.equal(uncertain.state, "PROCESSING");
  const uncertainOp = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: third.id } });
  assert.equal(uncertainOp.status, "OUTCOME_UNKNOWN");
  const callsBeforeTimeoutRetry = providerCalls;
  await prisma.bookingPaymentSlot.update({ where: { bookingId: third.id }, data: { leaseExpiresAt: new Date(0) } });
  const recovered = await createOrReusePaymentCheckout({ bookingId: third.id, actorId: actorA, channel: "PUBLIC", requestKey: timeoutKey }, fakeProvider);
  assert.equal(recovered.state, "RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, callsBeforeTimeoutRetry, "ambiguous provider result cannot be retried as a create");
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: uncertainOp.id } })).status, "RECONCILIATION_REQUIRED");
  assert.ok(sessions.get(uncertainOp.providerRequestKey), "provider had accepted the ambiguous request");
  assert.equal((await prisma.paymentOperation.count({ where: { bookingId: third.id } })), 1);
  console.log("PASS ambiguous provider success after expired lease requires review without a second create");

  const neverReached = await booking();
  const rejectedBeforeProvider: CheckoutProvider = { ...fakeProvider, create: async () => {
    throw new Error("synthetic request never reached provider");
  } };
  const neverKey = randomUUID();
  assert.equal((await createOrReusePaymentCheckout({
    bookingId: neverReached.id, actorId: actorA, channel: "PUBLIC", requestKey: neverKey,
  }, rejectedBeforeProvider)).state, "PROCESSING");
  const neverOp = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: neverReached.id } });
  assert.equal((await prisma.paymentOperation.count({ where: { bookingId: neverReached.id } })), 1);
  await prisma.bookingPaymentSlot.update({ where: { bookingId: neverReached.id }, data: { leaseExpiresAt: new Date(0) } });
  const beforeNeverRetry = providerCalls;
  assert.equal((await createOrReusePaymentCheckout({
    bookingId: neverReached.id, actorId: actorA, channel: "PUBLIC", requestKey: neverKey,
  }, fakeProvider)).state, "RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, beforeNeverRetry);
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: neverOp.id } })).status, "RECONCILIATION_REQUIRED");
  await assert.rejects(fakeProvider.create({
    amount: 1725, currency: "EUR", bookingId: neverReached.id, bookingRef: neverReached.bookingRef,
    customerEmail: "", customerName: "", description: "synthetic", operationId: neverOp.id,
    operationGeneration: 1, paymentChannel: "PUBLIC", idempotencyKey: neverOp.providerRequestKey,
    expiresAt: Math.floor(Date.now() / 1000) + 29 * 60,
  }), /synthetic Stripe invalid expires_at/);
  console.log("PASS never-sent request remains reviewable; strict fake rejects frozen expiry under 30 minutes");

  const localFailureBooking = await booking();
  let localFailureOnce = true;
  const lostLocalWrite = await createOrReusePaymentCheckout({
    bookingId: localFailureBooking.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID(),
  }, fakeProvider, { publish: async input => {
    if (localFailureOnce) { localFailureOnce = false; throw new Error("synthetic local persistence failure"); }
    return publishPaymentSession(input);
  } });
  assert.equal(lostLocalWrite.state, "PROCESSING");
  const localOp = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: localFailureBooking.id } });
  const providerSession = sessions.get(localOp.providerRequestKey);
  assert.equal(localOp.status, "OUTCOME_UNKNOWN");
  assert.equal(localOp.providerSessionId, providerSession.id);
  const callsBeforeLocalRecovery = providerCalls;
  await prisma.bookingPaymentSlot.update({ where: { bookingId: localFailureBooking.id }, data: { leaseExpiresAt: new Date(0) } });
  const localRecovery = await createOrReusePaymentCheckout({
    bookingId: localFailureBooking.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID(),
  }, fakeProvider);
  assert.equal(localRecovery.state, "READY");
  assert.equal((localRecovery as any).sessionId, providerSession.id);
  assert.equal(providerCalls, callsBeforeLocalRecovery, "known Session recovery uses provider GET, not create");
  assert.equal(await prisma.paymentOperation.count({ where: { bookingId: localFailureBooking.id } }), 1);
  console.log("PASS Stripe success plus local write failure recovers same provider Session");

  const fourth = await booking();
  const past = new Date("2026-01-01T00:00:00.000Z");
  const reserved = await reservePaymentOperation({ bookingId: fourth.id, actorId: actorA, channel: "PUBLIC" }, past);
  assert.equal(reserved.kind, "CREATE");
  const unsafeRetry = await reservePaymentOperation({ bookingId: fourth.id, actorId: actorA, channel: "PUBLIC" }, new Date(past.getTime() + 23 * 60 * 60_000));
  assert.equal(unsafeRetry.kind, "RECONCILIATION_REQUIRED");
  assert.equal((await prisma.paymentOperation.count({ where: { bookingId: fourth.id } })), 1);
  console.log("PASS provider retry boundary blocks another payable session for uncertain outcome");

  const agedReservationBooking = await booking();
  const agedReservation = await reservePaymentOperation({
    bookingId: agedReservationBooking.id, actorId: actorA, channel: "PUBLIC",
  }, new Date(Date.now() - 60_000));
  assert.equal(agedReservation.kind, "CREATE");
  const beforeAgedRetry = providerCalls;
  const agedRetry = await createOrReusePaymentCheckout({
    bookingId: agedReservationBooking.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID(),
  }, fakeProvider);
  assert.equal(agedRetry.state, "RECONCILIATION_REQUIRED");
  assert.equal(providerCalls, beforeAgedRetry, "a frozen expiry under Stripe's 30-minute minimum is not submitted");
  assert.equal((await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: agedReservationBooking.id } })).status, "RECONCILIATION_REQUIRED");
  console.log("PASS aged reservation with invalid frozen expiry never reaches provider creation");

  const fifth = await booking();
  const failureProvider = { ...fakeProvider };
  const failureKey = randomUUID();
  const bad = await createOrReusePaymentCheckout({ bookingId: fifth.id, actorId: actorA, channel: "PUBLIC", requestKey: failureKey }, failureProvider);
  assert.equal(bad.state, "READY");
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: fifth.id } })).status, "PENDING");
  const fifthOp = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: fifth.id } });
  sessions.get(fifthOp.providerRequestKey).status = "expired";
  const renewal = await createOrReusePaymentCheckout({ bookingId: fifth.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID() }, fakeProvider);
  assert.equal(renewal.state, "READY");
  assert.equal((await prisma.paymentOperation.count({ where: { bookingId: fifth.id } })), 2);
  assert.equal((await prisma.bookingPaymentSlot.findUniqueOrThrow({ where: { bookingId: fifth.id } })).generation, 2);
  console.log("PASS verified expired Session permits one new fenced generation without a new booking");

  const sixth = await booking();
  await prisma.$transaction(async tx => {
    await writeBookingActivationIntent(tx, sixth.id);
    await writeBookingActivationIntent(tx, sixth.id);
  });
  assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `booking-activation:${sixth.id}` } }), 1);
  await assert.rejects(prisma.$transaction(async tx => {
    await writeBookingActivationIntent(tx, first.id);
    throw new Error("synthetic rollback");
  }));
  assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `booking-activation:${first.id}` } }), 0);
  console.log("PASS activation intent is idempotent and rolls back with the business transaction");

  const early = await booking();
  await prisma.booking.update({ where: { id: early.id }, data: {
    scheduledRide: true, pickupAt: new Date(Date.now() + 2 * 60 * 60_000),
  } });
  const earlyReservation = await reservePaymentOperation({ bookingId: early.id, actorId: actorA, channel: "PUBLIC" });
  assert.equal(earlyReservation.kind, "CREATE");
  if (earlyReservation.kind !== "CREATE") throw new Error("early webhook reservation missing");
  const earlySession = {
    id: "cs_test_early_webhook", status: "complete", payment_status: "paid",
    payment_intent: { id: "pi_test_early_webhook" }, amount_total: 1725, currency: "eur",
    expires_at: Math.floor(earlyReservation.operation.providerExpiresAt!.getTime() / 1000),
    metadata: { bookingId: early.id, bookingRef: early.bookingRef,
      operationId: earlyReservation.operation.id,
      operationGeneration: String(earlyReservation.operation.generation), paymentChannel: "PUBLIC" },
  };
  const eventTime = Math.floor(Date.now() / 1000);
  const event = (id: string, type: string, object: typeof earlySession) => ({
    id, object: "event", type, created: eventTime, data: { object },
  });
  const wrongAmount = await deliverSignedWebhook(event("evt_test_wrong_amount", "checkout.session.completed", { ...earlySession, amount_total: 1726 }));
  assert.equal(wrongAmount.status, 500);
  assert.equal((await deliverSignedWebhook(event("evt_test_wrong_currency", "checkout.session.completed", { ...earlySession, currency: "usd" }))).status, 500);
  assert.equal((await deliverSignedWebhook(event("evt_test_wrong_operation_session", "checkout.session.completed", {
    ...earlySession, metadata: { ...earlySession.metadata, operationGeneration: "999" },
  }))).status, 500);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: early.id } })).status, "PENDING");
  const paidEvent = event("evt_test_early_paid", "checkout.session.completed", earlySession);
  assert.equal((await deliverSignedWebhook(paidEvent)).status, 200);
  assert.equal((await deliverSignedWebhook(paidEvent)).status, 200);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: early.id } })).status, "CONFIRMED");
  const paidOperation = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: earlyReservation.operation.id } });
  assert.equal(paidOperation.status, "PAID");
  assert.equal(paidOperation.providerSessionId, earlySession.id);
  assert.equal(paidOperation.providerPaymentId, "pi_test_early_webhook");
  assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `booking-activation:${early.id}` } }), 1);
  assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `booking-email-payment:${early.id}:pi_test_early_webhook` } }), 1);
  const lateExpiry = event("evt_test_late_expiry", "checkout.session.expired", { ...earlySession, status: "expired", payment_status: "unpaid" });
  assert.equal((await deliverSignedWebhook(lateExpiry)).status, 200);
  assert.equal((await deliverSignedWebhook(event("evt_test_bad_late_expiry", "checkout.session.expired", {
    ...earlySession, status: "expired", payment_status: "unpaid", amount_total: 1726,
  }))).status, 500);
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: earlyReservation.operation.id } })).status, "PAID");
  assert.equal(await prisma.outboxEvent.count({ where: { idempotencyKey: `booking-activation:${early.id}` } }), 1);
  assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { providerEventId: "evt_test_late_expiry" } })).processingStatus, "PROCESSED");
  console.log("PASS signed early webhook, exact amount, expanded PaymentIntent, duplicate and out-of-order settlement");

  await prisma.booking.update({ where: { id: third.id }, data: {
    scheduledRide: true, pickupAt: new Date(Date.now() + 2 * 60 * 60_000),
  } });
  const ambiguousSession = sessions.get(uncertainOp.providerRequestKey);
  const ambiguousPaid = { ...ambiguousSession, status: "complete", payment_status: "paid",
    payment_intent: { id: "pi_test_ambiguous_recovered" } };
  assert.equal((await deliverSignedWebhook(event("evt_test_ambiguous_paid", "checkout.session.completed", ambiguousPaid))).status, 200);
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: uncertainOp.id } })).status, "PAID");
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: third.id } })).status, "CONFIRMED");
  assert.equal((await deliverSignedWebhook(event("evt_test_ambiguous_late_expiry", "checkout.session.expired", {
    ...ambiguousSession, status: "expired", payment_status: "unpaid",
  }))).status, 200);
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: uncertainOp.id } })).status, "PAID");
  console.log("PASS signed provider evidence settles a review operation; late expiry cannot downgrade PAID");

  const legacy = await booking("PHONE_DISPATCH");
  const legacySessionId = "cs_test_legacy_expired";
  await prisma.bookingPaymentSlot.create({ data: { bookingId: legacy.id, sessionId: legacySessionId, leaseKey: legacySessionId } });
  await prisma.$runCommandRaw({ update: "booking_payment_slots", updates: [{
    q: { bookingId: { $oid: legacy.id } },
    u: { $unset: { activeOperationId: "", generation: "", leaseOwnerToken: "", leaseExpiresAt: "" } },
  }] });
  await prisma.bookingPayment.create({ data: {
    bookingId: legacy.id, amountMinor: 1725, providerSessionId: legacySessionId,
    expiresAt: new Date(Date.now() - 60_000), createdByDispatchOperatorId: actorA,
    idempotencyKey: randomUUID(),
  } });
  const legacyProvider: CheckoutProvider = { ...fakeProvider, get: async () => ({
    success: true, session: { id: legacySessionId, status: "expired", payment_status: "unpaid",
      amount_total: 1725, currency: "eur", metadata: { bookingId: legacy.id, bookingRef: legacy.bookingRef } },
  } as any) };
  assert.equal(await inspectLegacyPaymentLink(legacy, legacyProvider), null);
  assert.equal((await prisma.bookingPaymentSlot.findUniqueOrThrow({ where: { bookingId: legacy.id } })).sessionId, "");
  assert.equal((await prisma.bookingPayment.findUniqueOrThrow({ where: { providerSessionId: legacySessionId } })).status, "EXPIRED");
  console.log("PASS legacy Dispatcher slot with absent additive fields clears only after provider-confirmed expiry");

  const futureCash = await booking("PHONE_DISPATCH", "CONFIRMED");
  await prisma.booking.update({ where: { id: futureCash.id }, data: {
    paymentMethod: "CASH", cashAgreed: true, scheduledRide: true,
    pickupAt: new Date(Date.now() + 4 * 60 * 60_000),
    createdByDispatchOperatorId: actorA, passengerCount: 1, companionCount: 0,
    pickupLat: 48.1486, pickupLng: 17.1077, dropoffLat: 48.2, dropoffLng: 17.2,
  } });
  await prisma.$transaction(tx => writeBookingActivationIntent(tx, futureCash.id));
  await processBookingActivation(futureCash.id);
  await processBookingActivation(futureCash.id);
  assert.equal(await prisma.rideRequest.count({ where: { bookingId: futureCash.id } }), 0);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: futureCash.id } })).status, "CONFIRMED");
  console.log("PASS repeated activation of an eligible scheduled ride never starts immediate dispatch");
  assert.deepEqual(deriveOperationalAlerts({
    unassignedImmediate: 0, searching: 0, exhausted: 0, staleAssigned: 0,
    scheduledAttention: 0, failedOutbox: 0, staleOffers: 0, paymentReview: 1,
  }), [{ type: "PAYMENT_RECONCILIATION_REQUIRED", severity: "CRITICAL", count: 1, targetType: "PaymentOperation" }]);
  console.log("PASS unresolved payment operations appear in authorized Admin operational alerts");

  // A run must get past permanently ineligible rows. The scanner also needs
  // to retain its progress after a restart rather than rediscovering page 1.
  const blockedOperationIds: string[] = [];
  const transientBooking = await booking();
  assert.equal((await createOrReusePaymentCheckout({
    bookingId: transientBooking.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID(),
  }, fakeProvider, { publish: async () => { throw new Error("synthetic publication interruption"); } })).state, "PROCESSING");
  const transientOperation = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: transientBooking.id } });
  await prisma.paymentOperation.update({ where: { id: transientOperation.id }, data: { updatedAt: new Date(Date.now() - 4 * 60 * 60_000) } });
  await prisma.bookingPaymentSlot.update({ where: { bookingId: transientBooking.id }, data: { leaseExpiresAt: new Date(0) } });
  for (let i = 0; i < 105; i++) {
    const cancelled = await booking();
    const reservation = await reservePaymentOperation({ bookingId: cancelled.id, actorId: actorA, channel: "PUBLIC" });
    assert.equal(reservation.kind, "CREATE");
    if (reservation.kind !== "CREATE") throw new Error("cancelled reservation missing");
    blockedOperationIds.push(reservation.operation.id);
    await prisma.booking.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    await prisma.paymentOperation.update({ where: { id: reservation.operation.id }, data: {
      updatedAt: new Date(Date.now() - (3 * 60 * 60_000) + i * 1000),
    } });
    await prisma.bookingPaymentSlot.update({ where: { bookingId: cancelled.id }, data: { leaseExpiresAt: new Date(0) } });
  }
  const later = await booking();
  const laterAttempt = await createOrReusePaymentCheckout({
    bookingId: later.id, actorId: actorA, channel: "PUBLIC", requestKey: randomUUID(),
  }, fakeProvider, { publish: async () => { throw new Error("synthetic crash before publication"); } });
  assert.equal(laterAttempt.state, "PROCESSING");
  const laterOperation = await prisma.paymentOperation.findFirstOrThrow({ where: { bookingId: later.id } });
  assert.ok(laterOperation.providerSessionId);
  await prisma.paymentOperation.update({ where: { id: laterOperation.id }, data: { updatedAt: new Date(Date.now() - 60 * 60_000) } });
  await prisma.bookingPaymentSlot.update({ where: { bookingId: later.id }, data: { leaseExpiresAt: new Date(0) } });
  const createsBeforeScan = providerCalls;
  const unavailableProvider: CheckoutProvider = { ...fakeProvider, get: async sessionId => {
    if (sessionId === transientOperation.providerSessionId) throw new Error("synthetic provider read outage");
    return fakeProvider.get(sessionId);
  } };
  const firstScan = await reconcilePaymentOperationsOnce(25, unavailableProvider);
  assert.equal(firstScan.scanned, 100, "each pass has a fixed 100-operation safety cap");
  assert.equal(firstScan.reviewed, 99, "terminal rows leave the automatic retry set");
  const scan = await reconcilePaymentOperationsOnce(25, unavailableProvider);
  assert.ok(scan.scanned >= 7, "the next pass resumes beyond the first 100 operations");
  assert.ok(scan.reviewed >= 6);
  assert.ok(scan.recovered >= 1);
  assert.equal((await prisma.paymentOperation.findUniqueOrThrow({ where: { id: laterOperation.id } })).status, "READY");
  assert.equal(await prisma.paymentOperation.count({ where: { id: { in: blockedOperationIds }, status: "RECONCILIATION_REQUIRED" } }), 105);
  const deferred = await prisma.paymentOperation.findUniqueOrThrow({ where: { id: transientOperation.id } });
  assert.equal(deferred.status, "OUTCOME_UNKNOWN", "provider read outage is transient, not a false failure");
  assert.equal(deferred.reconciliationCode, "RETRY_UNAVAILABLE");
  assert.equal(providerCalls, createsBeforeScan, "reconciliation retrieves the known Session without creating another");
  const repeatScan = await reconcilePaymentOperationsOnce(25, fakeProvider);
  assert.equal(repeatScan.scanned, 0, "resolved/reviewed rows and deferred transient work do not block a later pass");
  assert.equal(await prisma.paymentOperation.count({ where: { bookingId: later.id } }), 1);
  console.log("PASS >100 blocked operations cannot starve a later recoverable Session across bounded passes; repeated scan is idempotent");
  console.log("Phase 2 disposable MongoDB payment checks passed");
}
main().catch(error => { console.error("PHASE2_PAYMENT_TEST_FAILED:", error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
