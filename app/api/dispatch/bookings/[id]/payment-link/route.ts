import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { getPaymentSession } from "@/lib/stripe";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import { sendDispatchPaymentLinkEmail } from "@/lib/email";
import { createOrReusePaymentCheckout, inspectLegacyPaymentLink } from "@/lib/payment-checkout";
import { getDispatchFareAmountMinor, isDispatchPaymentSessionBoundToBooking } from "@/lib/dispatch-invariants";

const BodySchema = z.object({ action: z.enum(["CREATE", "REGENERATE"]).default("CREATE"), idempotencyKey: z.string().uuid() }).strict();
const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, ...NO_STORE });
async function bookingForOperator(id: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  return prisma.booking.findFirst({ where: { id, bookingSource: "PHONE_DISPATCH" } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDispatchOperator(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const booking = await bookingForOperator(id);
  if (!booking) return json({ error: "Booking not found" }, 404);
  if (booking.paymentMethod !== "CARD") return json({ error: "This booking does not use card payment" }, 409);
  const amountMinor = getDispatchFareAmountMinor(booking);
  if (!hasAuthoritativeBookingPrice(booking) || amountMinor === null) {
    return json({ payment: { status: "RECONCILIATION_REQUIRED" }, url: null });
  }
  // Settled evidence wins over any stale link or operation state.
  const paid = await prisma.bookingPayment.findFirst({
    where: { bookingId: booking.id, provider: "STRIPE", paymentMethod: "CARD", status: "PAID", amountMinor, currency: "EUR" },
    orderBy: { paidAt: "desc" },
  });
  if (paid) return json({ payment: { id: paid.id, status: "PAID", amountMinor: paid.amountMinor, currency: paid.currency, paidAt: paid.paidAt }, url: null });
  const latest = await prisma.paymentOperation.findFirst({ where: { bookingId: booking.id }, orderBy: { createdAt: "desc" } });
  if (latest && ["RECONCILIATION_REQUIRED", "OUTCOME_UNKNOWN", "CREATING"].includes(latest.status)) {
    return json({ payment: { status: latest.status === "CREATING" ? "PROCESSING" : "RECONCILIATION_REQUIRED" }, url: null });
  }
  const payment = await prisma.bookingPayment.findFirst({ where: { bookingId: booking.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (!payment) return json({ payment: { status: latest?.status === "PAID" ? "PROCESSING" : "EXPIRED" }, url: null });
  const provider = await getPaymentSession(payment.providerSessionId).catch(() => null);
  if (!provider?.success || !isDispatchPaymentSessionBoundToBooking({ session: provider.session, providerSessionId: payment.providerSessionId, booking })) {
    return json({ payment: { status: "RECONCILIATION_REQUIRED" }, url: null });
  }
  if (provider.session?.payment_status === "paid") return json({ payment: { id: payment.id, status: "PROCESSING" }, url: null });
  if (provider.session?.status === "open" && typeof provider.session.url === "string") {
    return json({ payment: { id: payment.id, status: "PENDING", amountMinor: payment.amountMinor, currency: payment.currency, expiresAt: payment.expiresAt, emailStatus: payment.emailStatus }, url: provider.session.url });
  }
  return json({ payment: { id: payment.id, status: provider.session?.status === "expired" ? "EXPIRED" : "RECONCILIATION_REQUIRED" }, url: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDispatchOperator(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const booking = await bookingForOperator(id);
  if (!booking) return json({ error: "Booking not found" }, 404);
  if (booking.paymentMethod !== "CARD" || booking.status !== "PENDING" || !hasAuthoritativeBookingPrice(booking)) {
    return json({ error: "Booking is not eligible for a card payment link" }, 409);
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid payment-link request" }, 400);
  try {
    const legacy = await inspectLegacyPaymentLink(booking);
    const result = legacy || await createOrReusePaymentCheckout({
      bookingId: booking.id, actorId: auth.actor.id, channel: "PHONE_DISPATCH",
      requestKey: parsed.data.idempotencyKey,
    });
    if (result.state !== "READY") {
      const pending = result.state === "PROCESSING";
      return json({ error: pending ? "Payment link creation is in progress" : "Payment link requires review or is unavailable", paymentStatus: result.state }, pending ? 202 : 409);
    }
    const payment = await prisma.bookingPayment.findUnique({ where: { providerSessionId: result.sessionId } });
    if (!payment || payment.bookingId !== booking.id) return json({ error: "Payment link is being reconciled", paymentStatus: "PROCESSING" }, 202);
    if (!result.reused) {
      await prisma.dispatchAuditEvent.create({ data: {
        actorType: "DISPATCH_OPERATOR", actorId: auth.actor.id, action: parsed.data.action === "REGENERATE" ? "PAYMENT_LINK_REGENERATED" : "PAYMENT_LINK_CREATED",
        targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, requestId: randomUUID(),
        outcome: "SUCCESS", safeMetadata: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency },
      } }).catch(() => console.error("[dispatch.payment-link.audit-failed]", { code: "AUDIT_WRITE_FAILED" }));
    }
    let emailStatus = payment.emailStatus;
    if (booking.customerEmail && emailStatus !== "SENT") {
      const email = await sendDispatchPaymentLinkEmail({
        to: booking.customerEmail, bookingRef: booking.bookingRef,
        amount: `EUR ${(payment.amountMinor / 100).toFixed(2)}`,
        url: result.sessionUrl, expiresAt: payment.expiresAt,
        language: booking.languagePref, paymentId: payment.id,
      }).catch(() => ({ success: false }));
      emailStatus = email.success ? "SENT" : "FAILED";
      await prisma.bookingPayment.updateMany({ where: { id: payment.id, emailStatus: { not: "SENT" } }, data: { emailStatus } });
    } else if (!booking.customerEmail) {
      emailStatus = "NOT_PROVIDED";
    }
    return json({ success: true, reused: result.reused, payment: {
      id: payment.id, status: payment.status, amountMinor: payment.amountMinor,
      currency: payment.currency, expiresAt: payment.expiresAt, emailStatus,
    }, url: result.sessionUrl, emailSent: emailStatus === "SENT" }, result.reused ? 200 : 201);
  } catch {
    console.error("[dispatch.payment-link.failed]", { code: "PAYMENT_LINK_UNAVAILABLE" });
    return json({ error: "Payment link is temporarily unavailable" }, 503);
  }
}
