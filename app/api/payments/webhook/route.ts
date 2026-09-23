import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { isScheduledBooking } from "@/lib/scheduled-marketplace";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import { randomUUID } from "node:crypto";
import { recordDispatchAudit } from "@/lib/dispatch-audit";
import { validateDispatchCheckout } from "@/lib/dispatch-invariants";
import {
  bookingToEmailData,
  sendBookingCompletionEmails,
  sendPaymentReceipt,
} from "@/lib/email";

class SafeWebhookFailure extends Error {
  constructor(readonly safeFailureCode: string) { super(safeFailureCode); }
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
    let receipt = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: event.id } });
    if (receipt?.processingStatus === "PROCESSED") {
      const recovered = event.type === "checkout.session.completed" ? await prisma.booking.findFirst({ where: { id: event.data.object?.metadata?.bookingId, status: "CONFIRMED", paymentMethod: "CARD", driverId: null, dispatchStatus: "NOT_STARTED" } }) : null;
      const activeOffer = recovered ? await prisma.rideRequest.findFirst({ where: { bookingId: recovered.id, status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true } }) : null;
      const recoveredDispatch = recovered && !activeOffer && !isScheduledBooking(recovered) ? await startAutomaticDispatch(recovered.id) : null;
      if (recoveredDispatch && !recoveredDispatch.ok) return NextResponse.json({ error: "Dispatch release is pending" }, { status: 500 });
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!receipt) {
      try { receipt = await prisma.paymentWebhookEvent.create({ data: { providerEventId: event.id, eventType: event.type } }); }
      catch (error: any) {
        if (error?.code !== "P2002") throw error;
        receipt = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: event.id } });
      }
    }
    const object = event.data.object as any;
    let updatedBooking: any | null = null;
    let payment: any | null = null;
    if (event.type === "checkout.session.completed") {
      payment = await prisma.bookingPayment.findUnique({ where: { providerSessionId: String(object.id) } });
      if (payment) {
        updatedBooking = await handleDispatchCheckoutCompleted(object, payment, receipt!.id, event.created);
      } else {
        const metadataBookingId = object.metadata?.bookingId;
        const metadataBooking = typeof metadataBookingId === "string" && /^[a-f0-9]{24}$/i.test(metadataBookingId)
          ? await prisma.booking.findUnique({ where: { id: metadataBookingId }, select: { id: true, bookingSource: true } })
          : null;
        if (metadataBooking?.bookingSource === "PHONE_DISPATCH") throw new SafeWebhookFailure("PHONE_DISPATCH_PAYMENT_RECORD_MISSING");
        updatedBooking = await handleCheckoutCompleted(object);
      }
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
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
    if (receipt && receipt.processingStatus !== "PROCESSED") await prisma.paymentWebhookEvent.update({ where: { id: receipt.id }, data: { ...(updatedBooking ? { bookingId: updatedBooking.id } : {}), ...(payment ? { paymentId: payment.id } : {}), processingStatus: "PROCESSED", processedAt: new Date() } });
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

async function handleDispatchCheckoutCompleted(session: any, payment: any, eventRowId: string, eventCreatedAt: number): Promise<any | null> {
  const bookingId = session.metadata?.bookingId;
  const bookingRef = session.metadata?.bookingRef;
  const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
  if (!booking) throw new Error("DISPATCH_PAYMENT_BINDING_FAILED");
  const validation = validateDispatchCheckout({ booking, payment, session, eventCreatedAt });
  if (validation !== "OK") throw new Error(`DISPATCH_PAYMENT_${validation}`);
  if (!hasAuthoritativeBookingPrice(booking)) throw new Error("DISPATCH_PAYMENT_FARE_SIGNATURE_MISMATCH");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const result = await prisma.$transaction(async (tx) => {
    const paid = await tx.bookingPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(eventCreatedAt * 1000), providerPaymentId: paymentIntent } });
    if (paid.count === 0) {
      const current = await tx.bookingPayment.findUnique({ where: { id: payment.id } });
      if (current?.status !== "PAID") throw new Error("DISPATCH_PAYMENT_NOT_PENDING");
      await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: { bookingId: booking.id, paymentId: payment.id, processingStatus: "PROCESSED", processedAt: new Date() } });
      return tx.booking.findUnique({ where: { id: booking.id } });
    }
    const confirmed = await tx.booking.updateMany({ where: { id: booking.id, bookingSource: "PHONE_DISPATCH", paymentMethod: "CARD", status: "PENDING" }, data: { status: "CONFIRMED" } });
    if (confirmed.count !== 1) throw new Error("DISPATCH_BOOKING_STATE_CONFLICT");
    await tx.bookingPaymentSlot.updateMany({ where: { bookingId: booking.id, sessionId: payment.providerSessionId }, data: { sessionId: "", leaseKey: "" } });
    await tx.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: payment.createdByDispatchOperatorId, action: "PAYMENT_CONFIRMED", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency } } });
    await tx.paymentWebhookEvent.update({ where: { id: eventRowId }, data: { bookingId: booking.id, paymentId: payment.id, processingStatus: "PROCESSED", processedAt: new Date() } });
    return tx.booking.findUnique({ where: { id: booking.id } });
  });
  if (!result) throw new Error("DISPATCH_CONFIRMED_BOOKING_NOT_FOUND");
  if (result?.customerEmail) {
    await sendPaymentReceipt({ ...bookingToEmailData(result), amount: payment.amountMinor / 100, paymentId: paymentIntent || session.id });
  }
  await sendBookingCompletionEmails(bookingToEmailData(result));
  return result;
}

async function handleCheckoutCompleted(session: any): Promise<any | null> {
  const bookingId = session.metadata?.bookingId;
  const bookingRef = session.metadata?.bookingRef;
  if (!bookingId || !bookingRef || session.payment_status !== "paid") {
    throw new Error("Invalid completed checkout metadata");
  }

  const booking = await prisma.booking.findUnique({ where: { id: String(bookingId) } });
  if (!booking || booking.bookingRef !== bookingRef || booking.paymentMethod !== "CARD") {
    throw new Error("Checkout booking binding failed");
  }
  const expectedAmount = booking.estimatedPrice ? Math.round(booking.estimatedPrice * 100) : null;
  if (!hasAuthoritativeBookingPrice(booking) || expectedAmount === null ||
    session.amount_total !== expectedAmount || session.currency !== "eur") {
    throw new Error("Checkout amount or currency mismatch");
  }

  const updated = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      status: "PENDING",
    },
    data: { status: "CONFIRMED" },
  });
  if (updated.count === 0) return null;

  const confirmedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
  if (!confirmedBooking) return null;
  if (confirmedBooking.customerEmail) {
    await sendPaymentReceipt({
      ...bookingToEmailData(confirmedBooking),
      amount: expectedAmount / 100,
      paymentId: session.payment_intent || session.id,
    });
  }
  await sendBookingCompletionEmails(bookingToEmailData(confirmedBooking));
  return confirmedBooking;
}
