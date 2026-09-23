import { createHash } from "node:crypto";

export const DISPATCH_PAYMENT_LINK_TTL_MS = 30 * 60 * 1000;

export function hashDispatchIdempotencyKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function scopeDispatchPaymentLinkIdempotencyKey(operatorId: string, bookingId: string, clientUuid: string) {
  return `${operatorId}:${bookingId}:${clientUuid}`;
}

export function isDispatchPaymentLinkOwnedBy(input: {
  payment: { bookingId: string; createdByDispatchOperatorId: string; paymentMethod: string };
  bookingId: string;
  operatorId: string;
}) {
  return input.payment.bookingId === input.bookingId &&
    input.payment.createdByDispatchOperatorId === input.operatorId &&
    input.payment.paymentMethod === "CARD";
}

export function isDispatchPaymentSessionBoundToBooking(input: {
  session: { id?: string | null; metadata?: { bookingId?: string | null; bookingRef?: string | null } | null } | null | undefined;
  providerSessionId: string;
  booking: { id: string; bookingRef: string };
}) {
  return input.session?.id === input.providerSessionId &&
    input.session.metadata?.bookingId === input.booking.id &&
    input.session.metadata?.bookingRef === input.booking.bookingRef;
}

export function getDispatchFareAmountMinor(booking: { fareTotalFare?: number | null; estimatedPrice?: number | null }) {
  const amount = booking.fareTotalFare ?? booking.estimatedPrice;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

export type DispatchCheckoutMismatch = "OK" | "BOOKING_BINDING" | "PAYMENT_STATE" | "SESSION_BINDING" | "AMOUNT_CURRENCY" | "SESSION_EXPIRY" | "EXPIRED";

export function validateDispatchCheckout(input: {
  booking: { id: string; bookingRef: string; bookingSource: string; paymentMethod: string; fareTotalFare?: number | null; estimatedPrice?: number | null };
  payment: { bookingId: string; providerSessionId: string; amountMinor: number; currency: string; status: string; expiresAt: Date };
  session: { id: string; status: string | null; payment_status: string; metadata?: { bookingId?: string; bookingRef?: string } | null; amount_total: number | null; currency: string | null; expires_at?: number | null };
  eventCreatedAt: number;
}): DispatchCheckoutMismatch {
  const { booking, payment, session } = input;
  if (payment.bookingId !== booking.id || session.metadata?.bookingId !== booking.id || session.metadata?.bookingRef !== booking.bookingRef || booking.bookingSource !== "PHONE_DISPATCH" || booking.paymentMethod !== "CARD") return "BOOKING_BINDING";
  if (payment.status !== "PENDING" || session.payment_status !== "paid" || session.status !== "complete") return "PAYMENT_STATE";
  if (session.id !== payment.providerSessionId) return "SESSION_BINDING";
  if (session.amount_total !== payment.amountMinor || payment.currency !== "EUR" || session.currency !== "eur" || getDispatchFareAmountMinor(booking) !== payment.amountMinor) return "AMOUNT_CURRENCY";
  if (typeof session.expires_at !== "number" || Math.floor(payment.expiresAt.getTime() / 1000) !== session.expires_at) return "SESSION_EXPIRY";
  if (!Number.isInteger(input.eventCreatedAt) || input.eventCreatedAt >= session.expires_at) return "EXPIRED";
  return "OK";
}
