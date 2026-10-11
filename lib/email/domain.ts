import { writeOutboxEvent } from "@/lib/outbox";

export function writeBookingCreatedEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_CREATED", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-created:" + bookingId, payload: { bookingId } });
}
export function writeBookingAssignedEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string, driverId: string, acceptedAt: Date) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_ASSIGNED", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-assigned:" + bookingId + ":" + driverId + ":" + acceptedAt.getTime(), payload: { bookingId, driverId, assignedAtMs: acceptedAt.getTime() } });
}
export function writeBookingPaymentEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string, paymentId: string, amount: number) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_PAYMENT", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-payment:" + bookingId + ":" + paymentId, payload: { bookingId, paymentId, amount } });
}
