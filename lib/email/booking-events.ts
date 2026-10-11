import { prisma } from "@/lib/prisma";
import { bookingPickupAt } from "../scheduled-marketplace";
import { getAdminEmail } from "@/lib/email";
import { emailLocale } from "./templates";
import { sendTransactionalEmail } from "./send";
import { emailAddress, EmailError } from "./config";
import type { AssignmentMail, BookingMail, TransactionalEmail } from "./types";
import type { Prisma } from "@prisma/client";

export const BOOKING_EMAIL_SELECT = {
  id: true, bookingRef: true, customerEmail: true, languagePref: true,
  status: true, driverId: true, acceptedAt: true, scheduledRide: true,
  pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true,
  marketTimezone: true, pickupAddress: true, dropoffAddress: true, serviceType: true,
  fareTotalFare: true, estimatedPrice: true, paymentMethod: true,
  driver: { select: { fullName: true, vehiclePlate: true, vehicleType: true,
    vehicle: { select: { brand: true, model: true, plateNumber: true, type: true } } } },
} as const;

export function isCurrentEmailAssignment(booking: { driverId: string | null; acceptedAt: Date | null; status: string }, payload: { driverId?: unknown; assignedAtMs?: unknown }): boolean {
  return Boolean(booking.driverId && booking.acceptedAt && booking.driverId === payload.driverId &&
    booking.acceptedAt.getTime() === payload.assignedAtMs && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status));
}

type BookingEmailRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_EMAIL_SELECT }>;
type BookingEmailDependencies = {
  findBooking: (id: string) => Promise<BookingEmailRow | null>;
  enqueue: typeof sendTransactionalEmail;
  adminRecipient: () => string;
};
const defaultDependencies: BookingEmailDependencies = {
  findBooking: (id) => prisma.booking.findUnique({ where: { id }, select: BOOKING_EMAIL_SELECT }),
  enqueue: sendTransactionalEmail,
  adminRecipient: getAdminEmail,
};
export async function processBookingEmailEvent(event: { eventType: string; aggregateId: string; payload: unknown }, dependencies = defaultDependencies) {
  const payload = event.payload as { driverId?: string; assignedAtMs?: number; paymentId?: string; amount?: number };
  const booking = await dependencies.findBooking(event.aggregateId);
  if (!booking) return;
  if (event.eventType === "BOOKING_EMAIL_ASSIGNED" && !isCurrentEmailAssignment(booking, payload)) return;
  const pickup = bookingPickupAt(booking);
  if (!pickup) throw new EmailError("EMAIL_PICKUP_INVALID");
  const data: BookingMail = { bookingRef: booking.bookingRef, pickupAt: pickup.toISOString(), marketTimezone: booking.marketTimezone || "Europe/Bratislava", pickupAddress: booking.pickupAddress, destination: booking.dropoffAddress, serviceType: booking.serviceType, amount: booking.fareTotalFare ?? booking.estimatedPrice, paymentMethod: booking.paymentMethod };
  const locale = emailLocale(booking.languagePref);
  let customerEmail: string | undefined;
  if (booking.customerEmail) {
    try { customerEmail = emailAddress(booking.customerEmail); }
    catch { console.warn("[email.recipient.skipped]", { correlationId: booking.id, code: "EMAIL_INVALID_ADDRESS" }); }
  }
  let adminRecipient: string | undefined;
  try { adminRecipient = emailAddress(dependencies.adminRecipient()); }
  catch { console.error("[email.admin-recipient.failed]", { correlationId: booking.id, code: "EMAIL_ADMIN_RECIPIENT_UNAVAILABLE" }); }
  const inputs: TransactionalEmail[] = [];
  if (event.eventType === "BOOKING_EMAIL_CREATED") {
    if (customerEmail) inputs.push({ type: "BOOKING_RECEIVED", recipient: customerEmail, locale, data, idempotencyKey: "BOOKING_RECEIVED:" + booking.id, correlationId: booking.id });
    if (adminRecipient) inputs.push({ type: "ADMIN_BOOKING_CREATED", recipient: adminRecipient, locale, data, idempotencyKey: "ADMIN_BOOKING_CREATED:" + booking.id, correlationId: booking.id });
    if (adminRecipient && ["SENIOR", "ACCESSIBLE"].includes(booking.serviceType)) inputs.push({ type: "ADMIN_ASSISTED_COPY", recipient: adminRecipient, locale, data, idempotencyKey: "ADMIN_ASSISTED_COPY:" + booking.id, correlationId: booking.id });
  } else if (event.eventType === "BOOKING_EMAIL_PAYMENT") {
    if (!payload.paymentId || typeof payload.amount !== "number" || !Number.isFinite(payload.amount)) throw new EmailError("EMAIL_PAYMENT_DATA_INVALID");
    if (customerEmail) {
      inputs.push({ type: "PAYMENT_RECEIPT", recipient: customerEmail, locale, data: { bookingRef: booking.bookingRef, amount: payload.amount }, idempotencyKey: "PAYMENT_RECEIPT:" + payload.paymentId, correlationId: booking.id });
      inputs.push({ type: "BOOKING_CONFIRMED", recipient: customerEmail, locale, data, idempotencyKey: "BOOKING_CONFIRMATION_INVOICE:" + booking.bookingRef, correlationId: booking.id });
    }
    if (adminRecipient) inputs.push({ type: "ADMIN_BOOKING_CREATED", recipient: adminRecipient, locale, data, idempotencyKey: "ADMIN_BOOKING_CREATED:" + booking.id, correlationId: booking.id });
  } else if (booking.driver) {
    const vehicle = booking.driver.vehicle;
    const assigned: AssignmentMail = { ...data, driverName: booking.driver.fullName, vehicle: [vehicle?.brand, vehicle?.model].filter(Boolean).join(" ") || vehicle?.type || booking.driver.vehicleType || undefined, registration: vehicle?.plateNumber || booking.driver.vehiclePlate || undefined };
    const identity = booking.id + ":" + booking.driverId + ":" + payload.assignedAtMs;
    const assignment = { bookingId: booking.id, driverId: booking.driverId!, assignedAtMs: payload.assignedAtMs! };
    if (customerEmail) inputs.push({ type: "DRIVER_CONFIRMED", recipient: customerEmail, locale, data: assigned, idempotencyKey: "DRIVER_CONFIRMED:" + identity, correlationId: booking.id, assignment });
    if (adminRecipient) inputs.push({ type: "ADMIN_DRIVER_CONFIRMED", recipient: adminRecipient, locale, data: assigned, idempotencyKey: "ADMIN_DRIVER_CONFIRMED:" + identity, correlationId: booking.id, assignment });
  }
  // Each delivery has its own persistent identity. Retry cannot duplicate a queued sibling.
  for (const input of inputs) {
    const result = await dependencies.enqueue(input);
    if (!result.success) throw new EmailError(result.error || "EMAIL_ENQUEUE_FAILED", true);
  }
  // Customer delivery is independent of an operational mailbox misconfiguration.
  // Retry the domain event for Admin delivery; queued customer keys stay deduped.
  if (!adminRecipient) throw new EmailError("EMAIL_ADMIN_RECIPIENT_UNAVAILABLE", true);
}
