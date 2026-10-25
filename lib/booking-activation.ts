import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeOutboxEvent } from "@/lib/outbox";
import { authoritativeAssignmentEligibility } from "@/lib/booking-eligibility";
import { isScheduledBooking } from "@/lib/scheduled-marketplace";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";

const ACTIVATION_EVENT = "BOOKING_ACTIVATION_REQUESTED";
const activationKey = (bookingId: string) => `booking-activation:${bookingId}`;

/** Called in the same MongoDB transaction that establishes payment or cash
 * eligibility. Redis is deliberately not involved in this commit. */
export async function writeBookingActivationIntent(tx: Pick<Prisma.TransactionClient, "outboxEvent">, bookingId: string) {
  const idempotencyKey = activationKey(bookingId);
  const existing = await tx.outboxEvent.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (existing) return existing;
  return writeOutboxEvent(tx, {
    eventType: ACTIVATION_EVENT, aggregateType: "Booking", aggregateId: bookingId,
    idempotencyKey, payload: { bookingId },
  });
}

/** The outbox processor may run repeatedly after a crash or lost BullMQ job.
 * The existing dispatch transaction and offer uniqueness remain authoritative. */
export async function processBookingActivation(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.driverId || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return;
  const eligible = await authoritativeAssignmentEligibility(booking, prisma);
  if (!eligible.eligible) throw new Error("BOOKING_ACTIVATION_NOT_ELIGIBLE");
  // Scheduled rides are visible through the existing eligible marketplace;
  // this event must never prematurely start immediate automatic dispatch.
  if (isScheduledBooking(booking)) return;
  const result = await startAutomaticDispatch(bookingId);
  if (!result.ok) throw new Error("BOOKING_ACTIVATION_DISPATCH_RETRY");
}

export function isBookingActivationEvent(eventType: string) {
  return eventType === ACTIVATION_EVENT;
}
