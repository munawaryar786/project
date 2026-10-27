import type { Prisma } from "@prisma/client";

// One source-aware prerequisite policy for automatic dispatch, marketplace
// claims, offer acceptance and manual assignment. No staff override bypasses it.
export function bookingAssignmentPrerequisites(booking: any) {
  if (!booking || !["PENDING", "CONFIRMED", "SEARCHING_DRIVER"].includes(booking.status)) return { eligible: false as const, reason: "BOOKING_NOT_DISPATCHABLE" };
  if (booking.driverId) return { eligible: false as const, reason: "BOOKING_ALREADY_ASSIGNED" };
  if (!["STANDARD", "SENIOR", "ACCESSIBLE", "CHILDREN", "AIRPORT", "RENTAL"].includes(booking.serviceType) ||
      !Number.isInteger(booking.passengerCount) || booking.passengerCount < 1 ||
      !Number.isInteger(booking.companionCount ?? 0) || (booking.companionCount ?? 0) < 0 ||
      booking.passengerCount + Number(booking.companionCount || 0) > 6) return { eligible: false as const, reason: "BOOKING_NOT_DISPATCHABLE" };
  if (!["CASH", "CARD", "INVOICE"].includes(booking.paymentMethod)) return { eligible: false as const, reason: "PAYMENT_NOT_CONFIRMED" };
  if (booking.bookingSource === "PHONE_DISPATCH") {
    if (!booking.createdByDispatchOperatorId) return { eligible: false as const, reason: "BOOKING_AUTHORIZATION_REQUIRED" };
  } else if (!booking.passengerId || booking.phoneVerified !== true || booking.passengerAuthStatus !== "AUTHENTICATED") {
    return { eligible: false as const, reason: "PASSENGER_VERIFICATION_REQUIRED" };
  }
  if (booking.paymentMethod === "CARD" && booking.status === "PENDING") return { eligible: false as const, reason: "PAYMENT_NOT_CONFIRMED" };
  if (booking.paymentMethod === "CASH" && booking.cashAgreed !== true) return { eligible: false as const, reason: "CASH_AGREEMENT_REQUIRED" };
  if (!Number.isFinite(booking.pickupLat) || Math.abs(booking.pickupLat) > 90 || !Number.isFinite(booking.pickupLng) || Math.abs(booking.pickupLng) > 180 ||
      !Number.isFinite(booking.dropoffLat) || Math.abs(booking.dropoffLat) > 90 || !Number.isFinite(booking.dropoffLng) || Math.abs(booking.dropoffLng) > 180) return { eligible: false as const, reason: "NO_PICKUP_COORDINATES" };
  return { eligible: true as const };
}
type EligibilityDb = Pick<Prisma.TransactionClient, "bookingPayment" | "paymentWebhookEvent" | "bookingInvoice">;
export async function authoritativeAssignmentEligibility(booking: any, db: EligibilityDb) {
  const prerequisite = bookingAssignmentPrerequisites(booking);
  if (!prerequisite.eligible) return prerequisite;
  if (booking.paymentMethod === "INVOICE") {
    const amountMinor = Math.round(Number(booking.fareTotalFare ?? booking.estimatedPrice) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !booking.passengerId)
      return { eligible: false as const, reason: "INVOICE_NOT_ISSUED" };
    const invoice = await db.bookingInvoice.findUnique({ where: { bookingId: booking.id },
      select: { passengerId: true, amountMinor: true, currency: true, status: true } });
    if (!invoice || invoice.passengerId !== booking.passengerId || invoice.amountMinor !== amountMinor ||
        invoice.currency !== "EUR" || !["ISSUED", "PAID"].includes(invoice.status))
      return { eligible: false as const, reason: "INVOICE_NOT_ISSUED" };
    return { eligible: true as const };
  }
  if (booking.paymentMethod !== "CARD") return prerequisite;
  const amountMinor = Math.round(Number(booking.fareTotalFare ?? booking.estimatedPrice) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { eligible: false as const, reason: "PAYMENT_NOT_CONFIRMED" };
  const payment = await db.bookingPayment.findFirst({ where: {
    bookingId: booking.id, provider: "STRIPE", paymentMethod: "CARD", status: "PAID", currency: "EUR",
    amountMinor,
  }, select: { id: true } });
  if (payment) return { eligible: true as const };
  // Existing public Checkout predates BookingPayment. Its receipt is written
  // only by verified signed webhook processing; retain that legitimate evidence.
  if (booking.bookingSource !== "PHONE_DISPATCH") {
    const receiptBase = {
      bookingId: booking.id, provider: "STRIPE", eventType: "checkout.session.completed", processingStatus: "PROCESSED",
    };
    const currentReceipt = await db.paymentWebhookEvent.findFirst({ where: {
      ...receiptBase, amountMinor, currency: "EUR",
    }, select: { id: true } });
    if (currentReceipt) return { eligible: true as const };
    // Pre-correction signed webhook receipts did not persist provider amount and
    // currency. Preserve those already-linked historical receipts, but require
    // exact evidence for every enriched/current receipt.
    const legacyReceipt = await db.paymentWebhookEvent.findFirst({ where: {
      ...receiptBase,
      AND: [
        { OR: [{ amountMinor: null }, { amountMinor: { isSet: false } }] },
        { OR: [{ currency: null }, { currency: { isSet: false } }] },
      ],
    }, select: { id: true } });
    if (legacyReceipt) return { eligible: true as const };
  }
  return { eligible: false as const, reason: "PAYMENT_NOT_CONFIRMED" };
}
