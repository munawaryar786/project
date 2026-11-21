import { writeBookingPaymentEmail } from "@/lib/email/domain";
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { isScheduledBooking } from "@/lib/scheduled-marketplace";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import { randomUUID } from "node:crypto";
import { recordDispatchAudit } from "@/lib/dispatch-audit";
import { validateDispatchCheckout } from "@/lib/dispatch-invariants";
import { paymentFareSnapshot } from "@/lib/payment-operations";
import { writeBookingActivationIntent } from "@/lib/booking-activation";

class SafeWebhookFailure extends Error {
  constructor(readonly safeFailureCode: string) { super(safeFailureCode); }
}

function stripeReceiptEvidence(session: any, eventCreatedAt: number) {
  const providerPaymentId = typeof session?.payment_intent === "string"
    ? session.payment_intent
    : session?.payment_intent?.id || null;
  return {
    providerSessionId: typeof session?.id === "string" ? session.id : null,
    providerPaymentId,
    amountMinor: Number.isSafeInteger(session?.amount_total) && session.amount_total > 0 && session.amount_total <= 2_147_483_647
      ? session.amount_total
      : null,
    currency: typeof session?.currency === "string" ? session.currency.toUpperCase() : null,
    paidAt: Number.isFinite(eventCreatedAt) ? new Date(eventCreatedAt * 1000) : null,
  };
}

async function writePaymentEmailOnce(tx: any, bookingId: string, paymentId: string, amount: number, language?: string | null) {
  const idempotencyKey = `booking-email-payment:${bookingId}:${paymentId}`;
  const existing = await tx.outboxEvent.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (!existing) await writeBookingPaymentEmail(tx, bookingId, paymentId, amount, language);
}

export async function POST(request: NextRequest) {
  let eventId: string | null = null;
  try {
    const rawBody = await request.text();
    const { valid, event } = verifyWebhookSignature(
      rawBody,
      request.headers.get("stripe-signature")
    );
    if (!valid || !event) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    eventId = event.id;
    const object = event.data.object as any;
    const receiptEvidence = event.type === "checkout.session.completed"
      ? stripeReceiptEvidence(object, event.created)
      : {};
    let receipt = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: event.id } });
    if (receipt?.processingStatus === "PROCESSED") {
      const metadataBookingId = object?.metadata?.bookingId;
      const recovered = event.type === "checkout.session.completed" && receipt.bookingId && receipt.bookingId === metadataBookingId
        ? await prisma.booking.findFirst({ where: { id: receipt.bookingId, status: "CONFIRMED", paymentMethod: "CARD", driverId: null, dispatchStatus: "NOT_STARTED" } })
        : null;
      const activationBooking = event.type === "checkout.session.completed" && receipt.bookingId && receipt.bookingId === metadataBookingId
        ? await prisma.booking.findFirst({ where: { id: receipt.bookingId, status: "CONFIRMED", paymentMethod: "CARD", driverId: null } })
        : null;
      if (activationBooking) await prisma.$transaction(tx => writeBookingActivationIntent(tx, activationBooking.id));
      const activeOffer = recovered ? await prisma.rideRequest.findFirst({ where: { bookingId: recovered.id, status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true } }) : null;
      const recoveredDispatch = recovered && !activeOffer && !isScheduledBooking(recovered) ? await startAutomaticDispatch(recovered.id) : null;
      if (recoveredDispatch && !recoveredDispatch.ok) return NextResponse.json({ error: "Dispatch release is pending" }, { status: 500 });
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!receipt) {
      try { receipt = await prisma.paymentWebhookEvent.create({ data: { providerEventId: event.id, eventType: event.type, ...receiptEvidence } }); }
      catch (error: any) {
        if (error?.code !== "P2002") throw error;
        receipt = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: event.id } });
      }
    }
    let updatedBooking: any | null = null;
    let payment: any | null = null;
    let receiptHandled = false;
    if (event.type === "checkout.session.completed") {
      const operationId = object?.metadata?.operationId;
      if (operationId !== undefined) {
        if (typeof operationId !== "string" || !/^[a-f0-9]{24}$/i.test(operationId)) throw new SafeWebhookFailure("PAYMENT_OPERATION_ID_INVALID");
        updatedBooking = await handleOperationCheckoutCompleted(object, operationId, receipt!.id, event.created);
        receiptHandled = true;
      } else {
      payment = await prisma.bookingPayment.findUnique({ where: { providerSessionId: String(object.id) } });
      if (payment) {
        updatedBooking = await handleDispatchCheckoutCompleted(object, payment, receipt!.id, event.created);
      } else {
        const metadataBookingId = object.metadata?.bookingId;
        const metadataBooking = typeof metadataBookingId === "string" && /^[a-f0-9]{24}$/i.test(metadataBookingId)
          ? await prisma.booking.findUnique({ where: { id: metadataBookingId }, select: { id: true, bookingSource: true } })
          : null;
        if (metadataBooking?.bookingSource === "PHONE_DISPATCH") throw new SafeWebhookFailure("PHONE_DISPATCH_PAYMENT_RECORD_MISSING");
        updatedBooking = await handleCheckoutCompleted(object, receipt!.id, event.created);
      }
      receiptHandled = true;
      }
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const operationId = object?.metadata?.operationId;
      if (operationId !== undefined) {
        if (typeof operationId !== "string" || !/^[a-f0-9]{24}$/i.test(operationId)) throw new SafeWebhookFailure("PAYMENT_OPERATION_ID_INVALID");
        await handleOperationSessionClosed(object, operationId, receipt!.id, event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED");
        receiptHandled = true;
      } else {
      payment = await prisma.bookingPayment.findUnique({ where: { providerSessionId: String(object.id) } });
      if (payment?.status === "PENDING") {
        const nextStatus = event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED";
        await prisma.$transaction(async (tx) => {
          await tx.bookingPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: nextStatus, ...(nextStatus === "EXPIRED" ? {} : { failedAt: new Date() }) } });
          await tx.bookingPaymentSlot.updateMany({ where: { bookingId: payment.bookingId, sessionId: payment.providerSessionId }, data: { sessionId: "", leaseKey: "" } });
          await tx.paymentWebhookEvent.update({ where: { id: receipt!.id }, data: { bookingId: payment.bookingId, paymentId: payment.id, processingStatus: "PROCESSED", processedAt: new Date() } });
        });
      }
      }
    }
    if (!receiptHandled && receipt && receipt.processingStatus !== "PROCESSED") await prisma.paymentWebhookEvent.update({ where: { id: receipt.id }, data: { ...(updatedBooking ? { bookingId: updatedBooking.id } : {}), ...(payment ? { paymentId: payment.id } : {}), processingStatus: "PROCESSED", processedAt: new Date() } });
    const dispatch = updatedBooking && !isScheduledBooking(updatedBooking) ? await startAutomaticDispatch(updatedBooking.id) : null;
    if (dispatch && !dispatch.ok) console.warn("[dispatch] payment-confirmed start deferred", { bookingId: updatedBooking.id, code: dispatch.code });
    if (dispatch && updatedBooking?.createdByDispatchOperatorId) await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: updatedBooking.createdByDispatchOperatorId, action: "DISPATCH_STARTED", targetType: "Booking", targetId: updatedBooking.id, bookingRef: updatedBooking.bookingRef, outcome: dispatch.ok ? "SUCCESS" : "FAILURE", safeMetadata: { code: dispatch.ok ? null : dispatch.code || "DISPATCH_PENDING" } }).catch(() => undefined);
    return NextResponse.json({ received: true });
  } catch (error) {
    const safeFailureCode = error instanceof SafeWebhookFailure ? error.safeFailureCode : error instanceof Error ? error.name.slice(0, 80) : "PROCESSING_FAILED";
    if (eventId) await prisma.paymentWebhookEvent.updateMany({ where: { providerEventId: eventId, processingStatus: { not: "PROCESSED" } }, data: { processingStatus: "FAILED", safeFailureCode } }).catch(() => undefined);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleOperationSessionClosed(session: any, operationId: string, eventRowId: string, status: "EXPIRED" | "FAILED") {
  if (typeof session?.id !== "string" || session.payment_status === "paid" ||
      (status === "EXPIRED" && session.status !== "expired")) {
    throw new SafeWebhookFailure("PAYMENT_CLOSE_EVIDENCE_INVALID");
  }
  await prisma.$transaction(async tx => {
    const operation = await tx.paymentOperation.findUnique({ where: { id: operationId } });
    if (!operation || session.metadata?.bookingId !== operation.bookingId ||
        session.metadata?.bookingRef !== operation.bookingRef ||
        session.metadata?.operationGeneration !== String(operation.generation) ||
        session.metadata?.paymentChannel !== operation.channel ||
        session.amount_total !== operation.amountMinor ||
        session.currency !== operation.currency.toLowerCase() ||
        session.expires_at !== Math.floor(operation.providerExpiresAt!.getTime() / 1000) ||
        (operation.providerSessionId && operation.providerSessionId !== session.id)) {
      throw new SafeWebhookFailure("PAYMENT_OPERATION_BINDING_FAILED");
    }
    if (operation.status === "PAID") {
      await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: {
        bookingId: operation.bookingId, operationId: operation.id, providerSessionId: session.id,
        processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date(),
      } });
      return;
    }
    await tx.paymentOperation.updateMany({ where: { id: operation.id, status: { not: "PAID" } }, data: {
      status, providerSessionKey: session.id, providerSessionId: session.id,
    } });
    await tx.bookingPayment.updateMany({ where: {
      bookingId: operation.bookingId, providerSessionId: session.id, status: "PENDING",
    }, data: { status, ...(status === "FAILED" ? { failedAt: new Date() } : {}) } });
    await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: {
      bookingId: operation.bookingId, operationId: operation.id, providerSessionId: session.id,
      processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date(),
    } });
  });
}

async function handleDispatchCheckoutCompleted(session: any, payment: any, eventRowId: string, eventCreatedAt: number): Promise<any | null> {
  const bookingId = session.metadata?.bookingId;
  const bookingRef = session.metadata?.bookingRef;
  const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
  if (!booking) throw new Error("DISPATCH_PAYMENT_BINDING_FAILED");
  const validation = validateDispatchCheckout({ booking, payment, session, eventCreatedAt });
  if (validation !== "OK") throw new Error(`DISPATCH_PAYMENT_${validation}`);
  if (!hasAuthoritativeBookingPrice(booking)) throw new Error("DISPATCH_PAYMENT_FARE_SIGNATURE_MISMATCH");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const evidence = stripeReceiptEvidence(session, eventCreatedAt);
  const result = await prisma.$transaction(async (tx) => {
    const paid = await tx.bookingPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(eventCreatedAt * 1000), providerPaymentId: paymentIntent } });
    if (paid.count === 0) {
      const current = await tx.bookingPayment.findUnique({ where: { id: payment.id } });
      if (current?.status !== "PAID") throw new Error("DISPATCH_PAYMENT_NOT_PENDING");
      await writePaymentEmailOnce(tx, booking.id, paymentIntent || session.id, payment.amountMinor / 100, booking.languagePref);
      await writeBookingActivationIntent(tx, booking.id);
      await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: { bookingId: booking.id, paymentId: payment.id, ...evidence, processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date() } });
      return tx.booking.findUnique({ where: { id: booking.id } });
    }
    const confirmed = await tx.booking.updateMany({ where: { id: booking.id, bookingSource: "PHONE_DISPATCH", paymentMethod: "CARD", status: "PENDING" }, data: { status: "CONFIRMED" } });
    if (confirmed.count !== 1) throw new Error("DISPATCH_BOOKING_STATE_CONFLICT");
    await writePaymentEmailOnce(tx, booking.id, paymentIntent || session.id, payment.amountMinor / 100, booking.languagePref);
    await writeBookingActivationIntent(tx, booking.id);
    await tx.bookingPaymentSlot.updateMany({ where: { bookingId: booking.id, sessionId: payment.providerSessionId }, data: { sessionId: "", leaseKey: "" } });
    await tx.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: payment.createdByDispatchOperatorId, action: "PAYMENT_CONFIRMED", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency } } });
    await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: { bookingId: booking.id, paymentId: payment.id, ...evidence, processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date() } });
    return tx.booking.findUnique({ where: { id: booking.id } });
  });
  if (!result) throw new Error("DISPATCH_CONFIRMED_BOOKING_NOT_FOUND");
  return result;
}

async function handleCheckoutCompleted(session: any, eventRowId: string, eventCreatedAt: number): Promise<any | null> {
  const bookingId = session.metadata?.bookingId;
  const bookingRef = session.metadata?.bookingRef;
  if (!bookingId || !bookingRef || session.payment_status !== "paid") {
    throw new Error("Invalid completed checkout metadata");
  }

  const evidence = stripeReceiptEvidence(session, eventCreatedAt);
  if (!evidence.providerSessionId || !evidence.paidAt || !Number.isFinite(evidence.paidAt.getTime())) {
    throw new Error("Checkout provider evidence missing");
  }
  const confirmedBooking = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: String(bookingId) } });
    if (!booking || booking.bookingRef !== bookingRef || booking.paymentMethod !== "CARD") {
      throw new Error("Checkout booking binding failed");
    }
    const expectedAmount = typeof booking.estimatedPrice === "number" ? Math.round(booking.estimatedPrice * 100) : null;
    if (!hasAuthoritativeBookingPrice(booking) || expectedAmount === null || !Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || expectedAmount > 2_147_483_647 ||
      session.amount_total !== expectedAmount || session.currency !== "eur" || evidence.amountMinor !== expectedAmount || evidence.currency !== "EUR") {
      throw new Error("Checkout amount or currency mismatch");
    }
    const receipt = await tx.paymentWebhookEvent.findUnique({ where: { id: eventRowId } });
    if (!receipt || receipt.provider !== "STRIPE" ||
      (receipt.bookingId && receipt.bookingId !== booking.id) ||
      (receipt.providerSessionId && receipt.providerSessionId !== evidence.providerSessionId) ||
      (receipt.providerPaymentId && receipt.providerPaymentId !== evidence.providerPaymentId) ||
      (receipt.amountMinor != null && receipt.amountMinor !== evidence.amountMinor) ||
      (receipt.currency && receipt.currency !== evidence.currency)) {
      throw new Error("Checkout receipt evidence conflict");
    }
    if (receipt.processingStatus === "PROCESSED") return null;
    const updated = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "PENDING",
      },
      data: { status: "CONFIRMED" },
    });
    const current = updated.count === 1 ? await tx.booking.findUnique({ where: { id: booking.id } }) : booking;
    if (!current || current.status === "PENDING") throw new Error("Checkout booking state conflict");
    const paymentId = evidence.providerPaymentId || evidence.providerSessionId!;
    await writePaymentEmailOnce(tx, booking.id, paymentId, expectedAmount / 100, booking.languagePref);
    await writeBookingActivationIntent(tx, booking.id);
    await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: {
      bookingId: booking.id,
      ...evidence,
      processingStatus: "PROCESSED",
      safeFailureCode: null,
      processedAt: new Date(),
    } });
    return current;
  });
  return confirmedBooking;
}

async function handleOperationCheckoutCompleted(session: any, operationId: string, eventRowId: string, eventCreatedAt: number) {
  const paymentIntentId = typeof session?.payment_intent === "string"
    ? session.payment_intent : session?.payment_intent?.id;
  if (session?.status !== "complete" || session?.payment_status !== "paid" ||
      !Number.isInteger(eventCreatedAt) || !Number.isSafeInteger(session?.amount_total) ||
      typeof session?.id !== "string" || typeof paymentIntentId !== "string" ||
      typeof session?.expires_at !== "number") throw new SafeWebhookFailure("PAYMENT_PROVIDER_EVIDENCE_INVALID");
  const evidence = stripeReceiptEvidence(session, eventCreatedAt);
  if (!evidence.paidAt || !Number.isFinite(evidence.paidAt.getTime())) throw new SafeWebhookFailure("PAYMENT_PROVIDER_TIME_INVALID");
  return prisma.$transaction(async tx => {
    const operation = await tx.paymentOperation.findUnique({ where: { id: operationId } });
    if (!operation || operation.channel !== session.metadata?.paymentChannel ||
        session.metadata?.operationGeneration !== String(operation.generation) ||
        session.metadata?.bookingId !== operation.bookingId ||
        session.metadata?.bookingRef !== operation.bookingRef ||
        session.amount_total !== operation.amountMinor ||
        session.currency !== operation.currency.toLowerCase() ||
        session.expires_at !== Math.floor(operation.providerExpiresAt!.getTime() / 1000) ||
        eventCreatedAt >= session.expires_at ||
        (operation.providerSessionId && operation.providerSessionId !== session.id) ||
        (operation.providerPaymentId && operation.providerPaymentId !== paymentIntentId)) {
      throw new SafeWebhookFailure("PAYMENT_OPERATION_BINDING_FAILED");
    }
    const booking = await tx.booking.findUnique({ where: { id: operation.bookingId } });
    const fare = booking && paymentFareSnapshot(booking, operation.channel as "PUBLIC" | "PHONE_DISPATCH");
    if (!booking || !fare || fare.amountMinor !== operation.amountMinor ||
        fare.fareSnapshotHash !== operation.fareSnapshotHash ||
        booking.bookingRef !== operation.bookingRef || booking.paymentMethod !== "CARD" ||
        (operation.channel === "PHONE_DISPATCH") !== (booking.bookingSource === "PHONE_DISPATCH")) {
      throw new SafeWebhookFailure("PAYMENT_BOOKING_BINDING_FAILED");
    }
    const receipt = await tx.paymentWebhookEvent.findUnique({ where: { id: eventRowId } });
    if (!receipt || receipt.provider !== "STRIPE" ||
        (receipt.bookingId && receipt.bookingId !== booking.id) ||
        (receipt.operationId && receipt.operationId !== operation.id) ||
        (receipt.providerSessionId && receipt.providerSessionId !== session.id) ||
        (receipt.providerPaymentId && receipt.providerPaymentId !== paymentIntentId) ||
        (receipt.amountMinor != null && receipt.amountMinor !== operation.amountMinor) ||
        (receipt.currency && receipt.currency !== "EUR")) {
      throw new SafeWebhookFailure("PAYMENT_RECEIPT_CONFLICT");
    }
    if (receipt.processingStatus === "PROCESSED") return booking;
    if (operation.status === "PAID" && booking.status === "CONFIRMED") {
      await tx.paymentWebhookEvent.update({ where: { id: receipt.id }, data: {
        bookingId: booking.id, operationId: operation.id, ...evidence,
        processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date(),
      } });
      await writeBookingActivationIntent(tx, booking.id);
      return booking;
    }
    if (booking.status !== "PENDING" || !["CREATING", "OUTCOME_UNKNOWN", "READY", "EXPIRED", "RECONCILIATION_REQUIRED"].includes(operation.status)) {
      throw new SafeWebhookFailure("PAYMENT_BOOKING_STATE_CONFLICT");
    }
    const priorSession = await tx.paymentOperation.findFirst({ where: {
      bookingId: booking.id, status: "PAID", id: { not: operation.id },
    }, select: { id: true } });
    if (priorSession) throw new SafeWebhookFailure("PAYMENT_DUPLICATE_SETTLEMENT");
    const changed = await tx.paymentOperation.updateMany({ where: { id: operation.id, status: operation.status }, data: {
      status: "PAID", providerSessionKey: session.id, providerSessionId: session.id,
      providerPaymentId: paymentIntentId, settledAt: evidence.paidAt, reconciliationCode: null,
    } });
    if (changed.count !== 1) throw new SafeWebhookFailure("PAYMENT_OPERATION_CONFLICT");
    let paymentId: string | null = null;
    if (operation.channel === "PHONE_DISPATCH") {
      let payment = await tx.bookingPayment.findUnique({ where: { providerSessionId: session.id } });
      if (payment && (payment.bookingId !== booking.id || (payment.operationId && payment.operationId !== operation.id))) {
        throw new SafeWebhookFailure("PAYMENT_RECORD_CONFLICT");
      }
      if (!payment) payment = await tx.bookingPayment.create({ data: {
        bookingId: booking.id, provider: "STRIPE", paymentMethod: "CARD", status: "PAID",
        amountMinor: operation.amountMinor, currency: "EUR", providerSessionId: session.id,
        providerPaymentId: paymentIntentId, expiresAt: operation.providerExpiresAt!,
        paidAt: evidence.paidAt, createdByDispatchOperatorId: operation.actorId,
        idempotencyKey: operation.requestScopeKey, operationId: operation.id,
      } });
      else await tx.bookingPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: {
        status: "PAID", paidAt: evidence.paidAt, providerPaymentId: paymentIntentId,
      } });
      paymentId = payment.id;
    }
    const confirmed = await tx.booking.updateMany({ where: {
      id: booking.id, status: "PENDING", paymentMethod: "CARD",
    }, data: { status: "CONFIRMED" } });
    if (confirmed.count !== 1) throw new SafeWebhookFailure("PAYMENT_BOOKING_STATE_CONFLICT");
    await tx.bookingPaymentSlot.updateMany({ where: {
      bookingId: booking.id, activeOperationId: operation.id, generation: operation.generation,
    }, data: { sessionId: session.id, leaseKey: session.id, leaseOwnerToken: null, leaseExpiresAt: null } });
    await writePaymentEmailOnce(tx, booking.id, paymentIntentId, operation.amountMinor / 100, booking.languagePref);
    await writeBookingActivationIntent(tx, booking.id);
    await tx.paymentWebhookEvent.update({ where: { id: receipt.id }, data: {
      bookingId: booking.id, operationId: operation.id, paymentId,
      ...evidence, processingStatus: "PROCESSED", safeFailureCode: null, processedAt: new Date(),
    } });
    return tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
  });
}
