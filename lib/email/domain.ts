import { writeOutboxEvent } from "@/lib/outbox";
import { emailLocale } from "./templates";

function localeSnapshot(language?: string | null) {
  return { locale: emailLocale(language) };
}
export function writeBookingCreatedEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string, language?: string | null) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_CREATED", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-created:" + bookingId, payload: { bookingId, ...localeSnapshot(language) } });
}
export function writeBookingAssignedEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string, driverId: string, acceptedAt: Date, language?: string | null) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_ASSIGNED", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-assigned:" + bookingId + ":" + driverId + ":" + acceptedAt.getTime(), payload: { bookingId, driverId, assignedAtMs: acceptedAt.getTime(), ...localeSnapshot(language) } });
}
export function writeBookingPaymentEmail(tx: Parameters<typeof writeOutboxEvent>[0], bookingId: string, paymentId: string, amount: number, language?: string | null) {
  return writeOutboxEvent(tx, { eventType: "BOOKING_EMAIL_PAYMENT", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "booking-email-payment:" + bookingId + ":" + paymentId, payload: { bookingId, paymentId, amount, ...localeSnapshot(language) } });
}
