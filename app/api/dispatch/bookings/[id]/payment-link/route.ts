import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { expirePaymentSession, createPaymentSession, getPaymentSession } from "@/lib/stripe";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import { sendDispatchPaymentLinkEmail } from "@/lib/email";
import { DISPATCH_PAYMENT_LINK_TTL_MS, getDispatchFareAmountMinor, hashDispatchIdempotencyKey, isDispatchPaymentLinkOwnedBy, isDispatchPaymentSessionBoundToBooking, scopeDispatchPaymentLinkIdempotencyKey } from "@/lib/dispatch-invariants";

const BodySchema = z.object({ action: z.enum(["CREATE", "REGENERATE"]).default("CREATE"), idempotencyKey: z.string().uuid() }).strict();
const PRIVATE_NO_STORE = { headers: { "Cache-Control": "private, no-store" } };
async function bookingForOperator(id: string) { if (!/^[a-f0-9]{24}$/i.test(id)) return null; return prisma.booking.findFirst({ where: { id, bookingSource: "PHONE_DISPATCH" } }); }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const { id } = await params; const booking = await bookingForOperator(id);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.paymentMethod !== "CARD") return NextResponse.json({ error: "This booking does not use card payment" }, { status: 409 });
  const payment = await prisma.bookingPayment.findFirst({ where: { bookingId: booking.id, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!payment) return NextResponse.json({ payment: { status: "EXPIRED" }, url: null }, PRIVATE_NO_STORE);
  try {
    const provider = await getPaymentSession(payment.providerSessionId);
    if (provider.success && isDispatchPaymentSessionBoundToBooking({ session: provider.session, providerSessionId: payment.providerSessionId, booking }) && provider.session?.status === "open" && provider.session?.payment_status !== "paid" && typeof provider.session.url === "string") return NextResponse.json({ payment: { id: payment.id, status: payment.status, amountMinor: payment.amountMinor, currency: payment.currency, expiresAt: payment.expiresAt }, url: provider.session.url }, PRIVATE_NO_STORE);
    return NextResponse.json({ payment: { id: payment.id, status: provider.session?.payment_status === "paid" ? "PENDING" : "EXPIRED", expiresAt: payment.expiresAt }, url: null }, PRIVATE_NO_STORE);
  } catch { return NextResponse.json({ error: "Payment link state is temporarily unavailable" }, { status: 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const { id } = await params; const booking = await bookingForOperator(id);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.paymentMethod !== "CARD" || booking.status !== "PENDING" || !hasAuthoritativeBookingPrice(booking)) return NextResponse.json({ error: "Booking is not eligible for a card payment link" }, { status: 409 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment-link request" }, { status: 400 });
  const idempotencyKey = scopeDispatchPaymentLinkIdempotencyKey(auth.actor.id, booking.id, parsed.data.idempotencyKey);
  const priorWithKey = await prisma.bookingPayment.findUnique({ where: { idempotencyKey } });
  if (priorWithKey) {
    if (!isDispatchPaymentLinkOwnedBy({ payment: priorWithKey, bookingId: booking.id, operatorId: auth.actor.id })) return NextResponse.json({ error: "Payment link idempotency scope mismatch" }, { status: 409, ...PRIVATE_NO_STORE });
    const provider = await getPaymentSession(priorWithKey.providerSessionId).catch(() => null);
    if (!provider?.success || !isDispatchPaymentSessionBoundToBooking({ session: provider.session, providerSessionId: priorWithKey.providerSessionId, booking })) return NextResponse.json({ error: "Payment session binding could not be verified" }, { status: 409, ...PRIVATE_NO_STORE });
    const url = provider.session?.status === "open" && provider.session?.payment_status !== "paid" ? provider.session.url || null : null;
    return NextResponse.json({ success: true, payment: { id: priorWithKey.id, status: priorWithKey.status, expiresAt: priorWithKey.expiresAt, emailStatus: priorWithKey.emailStatus }, url, emailSent: priorWithKey.emailStatus === "SENT" }, PRIVATE_NO_STORE);
  }
  const existing = await prisma.bookingPayment.findMany({ where: { bookingId: booking.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5 });
  const active = existing.find((item) => item.expiresAt > new Date());
  if (active) {
    const session = await getPaymentSession(active.providerSessionId).catch(() => null);
    if (!session?.success) return NextResponse.json({ error: "Payment session binding could not be verified" }, { status: 503, ...PRIVATE_NO_STORE });
    if (!isDispatchPaymentSessionBoundToBooking({ session: session.session, providerSessionId: active.providerSessionId, booking })) return NextResponse.json({ error: "Payment session binding could not be verified" }, { status: 409, ...PRIVATE_NO_STORE });
    if (parsed.data.action === "CREATE") {
      if (session.session?.payment_status === "paid") return NextResponse.json({ error: "Payment is being verified; do not create another link" }, { status: 409 });
      if (session.session?.status === "open" && typeof session.session.url === "string") return NextResponse.json({ success: true, reused: true, payment: { id: active.id, status: active.status, expiresAt: active.expiresAt, emailStatus: active.emailStatus }, url: session.session.url, emailSent: active.emailStatus === "SENT" }, PRIVATE_NO_STORE);
    }
  }
  let slot = await prisma.bookingPaymentSlot.findUnique({ where: { bookingId: booking.id } });
  if (!slot) {
    try { slot = await prisma.bookingPaymentSlot.create({ data: { bookingId: booking.id } }); }
    catch (error: any) { if (error?.code !== "P2002") return NextResponse.json({ error: "Payment link state is unavailable" }, { status: 503 }); slot = await prisma.bookingPaymentSlot.findUnique({ where: { bookingId: booking.id } }); }
  }
  if (!slot) return NextResponse.json({ error: "Payment link state is unavailable" }, { status: 503 });
  const slotLease = "CREATING:" + randomUUID();
  const claimedSlot = await prisma.bookingPaymentSlot.updateMany({ where: { id: slot.id, leaseKey: slot.leaseKey }, data: { leaseKey: slotLease } });
  if (claimedSlot.count !== 1) return NextResponse.json({ error: "Another payment-link request is in progress" }, { status: 409 });
  const amountMinor = getDispatchFareAmountMinor(booking);
  if (amountMinor === null) {
    await prisma.bookingPaymentSlot.updateMany({ where: { id: slot.id, leaseKey: slotLease }, data: { leaseKey: slot.sessionId } });
    return NextResponse.json({ error: "Booking fare is not payable" }, { status: 409 });
  }
  if (active) {
    try { await expirePaymentSession(active.providerSessionId); }
    catch { await prisma.bookingPaymentSlot.updateMany({ where: { id: slot.id, leaseKey: slotLease }, data: { leaseKey: slot.sessionId } }); return NextResponse.json({ error: "Existing payment session could not be safely expired" }, { status: 503 }); }
    await prisma.bookingPayment.update({ where: { id: active.id }, data: { status: "EXPIRED" } });
  }
  const expiresAt = new Date(Date.now() + DISPATCH_PAYMENT_LINK_TTL_MS);
  try {
    const created = await createPaymentSession({ amount: amountMinor, currency: "EUR", bookingId: booking.id, bookingRef: booking.bookingRef, customerEmail: booking.customerEmail || "", customerName: booking.customerName, description: `Booking ${booking.bookingRef}`, expiresAt: Math.floor(expiresAt.getTime() / 1000), idempotencyKey: hashDispatchIdempotencyKey(idempotencyKey) });
    if (!created.sessionUrl) throw new Error("Hosted Checkout URL unavailable");
    const payment = await prisma.bookingPayment.create({ data: { bookingId: booking.id, provider: "STRIPE", paymentMethod: "CARD", status: "PENDING", amountMinor, currency: "EUR", providerSessionId: created.sessionId, expiresAt, createdByDispatchOperatorId: auth.actor.id, idempotencyKey } });
    const updatedSlot = await prisma.bookingPaymentSlot.updateMany({ where: { id: slot.id, leaseKey: slotLease }, data: { sessionId: created.sessionId, leaseKey: created.sessionId } });
    if (updatedSlot.count !== 1) throw new Error("Payment-link slot lease was lost");
    await prisma.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: auth.actor.id, action: active ? "PAYMENT_LINK_REGENERATED" : "PAYMENT_LINK_CREATED", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { paymentId: payment.id, amountMinor: payment.amountMinor, currency: payment.currency } } });
    let emailSent = false; let emailStatus = booking.customerEmail ? "FAILED" : "NOT_PROVIDED";
    if (booking.customerEmail) {
      const email = await sendDispatchPaymentLinkEmail({ to: booking.customerEmail, bookingRef: booking.bookingRef, amount: `EUR ${(payment.amountMinor / 100).toFixed(2)}`, url: created.sessionUrl, expiresAt, language: booking.languagePref, paymentId: payment.id }).catch(() => ({ success: false } as any));
      emailSent = email.success; emailStatus = emailSent ? "SENT" : "FAILED";
      await prisma.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: auth.actor.id, action: "PAYMENT_LINK_EMAIL_SENT", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, requestId: randomUUID(), outcome: emailSent ? "SUCCESS" : "FAILURE", safeMetadata: { emailSent } } });
      await prisma.bookingPayment.update({ where: { id: payment.id }, data: { emailStatus } });
    }
    return NextResponse.json({ success: true, payment: { id: payment.id, status: payment.status, expiresAt, emailStatus }, url: created.sessionUrl, emailSent }, { status: 201, ...PRIVATE_NO_STORE });
  } catch {
    await prisma.bookingPaymentSlot.updateMany({ where: { id: slot.id, leaseKey: slotLease }, data: { leaseKey: slot.sessionId } }).catch(() => undefined);
    return NextResponse.json({ error: "Payment link could not be created" }, { status: 503 });
  }
}
