import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeOutboxEvent } from "@/lib/outbox";
import { createOrUpdateDriverEarningForBooking } from "@/lib/commission-engine";
import { postTripEarningLedger } from "@/lib/earnings-ledger";
import { ACTIVE_TRIP_STATUSES, canTransitionTrip, DRIVER_ERROR_CODES, evaluateDriverPresence, isLocationFresh } from "@/lib/driver-state";
import { driverCompatibility } from "@/lib/dispatch-matching";
import { getDispatchConfig } from "@/lib/dispatch-config";

type Db = Prisma.TransactionClient;
const ACCEPTABLE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"];
// Mongo differentiates absent optional fields from explicit null.
const UNASSIGNED: Prisma.BookingWhereInput = { OR: [{ driverId: null }, { driverId: { isSet: false } }] };
const ELIGIBLE: Prisma.BookingWhereInput = {
  AND: [UNASSIGNED, { status: { in: ACCEPTABLE_BOOKING_STATUSES } },
    { NOT: { paymentMethod: "CARD", status: "PENDING" } }],
};
class DriverConflict extends Error {
  constructor(readonly code: string) { super(code); }
}
function transactionFailure(error: unknown) {
  if (error instanceof DriverConflict) return { ok: false as const, code: error.code };
  if (typeof error === "object" && error && "code" in error && error.code === "P2034") {
    return { ok: false as const, code: "STATE_CONFLICT" };
  }
  // No assignment or lifecycle fallback outside the failed transaction.
  return { ok: false as const, code: DRIVER_ERROR_CODES.TRANSACTION_UNAVAILABLE };
}

export async function findConflictingActiveTrip(driverId: string, excludeBookingId?: string, db: Db = prisma) {
  return db.booking.findFirst({
    where: { driverId, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: [...ACTIVE_TRIP_STATUSES] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, bookingRef: true, status: true, scheduledDate: true, scheduledTime: true },
  });
}
export async function getDriverPresence(driverId: string, maxLocationAgeMs?: number) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { id: true, fullName: true, status: true, isOnline: true, isOnTrip: true,
      currentLat: true, currentLng: true, lastLocationUpdate: true,
      lastLocationReceivedAt: true, lastHeartbeatAt: true },
  });
  if (!driver) return null;
  const busy = driver.isOnTrip || Boolean(await findConflictingActiveTrip(driverId));
  // Legacy availability used to bump lastLocationUpdate without receiving GPS.
  // Only the new receipt field proves a location sample was received.
  const receivedAt = driver.currentLat !== null && driver.currentLng !== null ? driver.lastLocationReceivedAt : null;
  return { ...driver, isOnTrip: busy,
    locationFresh: isLocationFresh(receivedAt, new Date(), maxLocationAgeMs),
    state: evaluateDriverPresence({ isOnline: driver.isOnline, isOnTrip: busy,
      lastLocationReceivedAt: receivedAt, maxLocationAgeMs }) };
}
export async function expireDriverOffers(driverId: string, now = new Date(), db: Db = prisma) {
  return db.rideRequest.updateMany({ where: { driverId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", respondedAt: now } });
}

export async function createDriverOfferInTransaction(tx: Db, input: { bookingId: string; driverId: string; expiresAt?: Date; dispatchState?: string }) {
  const now = new Date();
  const expiresAt = input.expiresAt || new Date(now.getTime() + 30_000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_EXPIRED };
  const driver = await tx.driver.findUnique({ where: { id: input.driverId } });
  if (!driver || driver.status !== "ACTIVE" || !driver.isOnline || driver.isOnTrip || await findConflictingActiveTrip(input.driverId, undefined, tx)) return { ok: false as const, code: DRIVER_ERROR_CODES.DRIVER_NOT_AVAILABLE };
  const booking = await tx.booking.findFirst({ where: { id: input.bookingId, ...ELIGIBLE, ...(input.dispatchState ? { dispatchStatus: input.dispatchState } : {}) } });
  if (!booking) return { ok: false as const, code: DRIVER_ERROR_CODES.BOOKING_ALREADY_CLAIMED };
  const existing = await tx.rideRequest.findFirst({ where: { bookingId: input.bookingId, driverId: input.driverId } });
  if (existing) {
    if (existing.status === "PENDING" && existing.expiresAt > now) return { ok: true as const, offer: existing, reused: true };
    if (existing.status === "PENDING") await tx.rideRequest.updateMany({ where: { id: existing.id, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
    return { ok: false as const, code: "OFFER_ALREADY_EXISTS" };
  }
  const activeOffer = await tx.rideRequest.findFirst({ where: { bookingId: input.bookingId, status: "PENDING", expiresAt: { gt: now } }, select: { id: true } });
  if (activeOffer) return { ok: false as const, code: "ACTIVE_OFFER_EXISTS" };
  const claimedBooking = await tx.booking.updateMany({ where: { id: input.bookingId, ...ELIGIBLE, ...(input.dispatchState ? { dispatchStatus: input.dispatchState } : {}) }, data: { dispatchStatus: "SEARCHING_DRIVER" } });
  if (claimedBooking.count !== 1) throw new DriverConflict(DRIVER_ERROR_CODES.BOOKING_ALREADY_CLAIMED);
  const offer = await tx.rideRequest.create({ data: { bookingId: input.bookingId, driverId: input.driverId, status: "PENDING", sentAt: now, expiresAt } });
  return { ok: true as const, offer, reused: false };
}

export async function createDriverOffer(input: { bookingId: string; driverId: string; expiresAt?: Date }) {
  try { return await prisma.$transaction((tx) => createDriverOfferInTransaction(tx, input)); }
  catch (error) { return transactionFailure(error); }
}
export async function acceptDriverOfferAtomically(input: { offerId: string; driverId: string }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const offer = await tx.rideRequest.findUnique({ where: { id: input.offerId } });
      if (!offer || offer.driverId !== input.driverId) return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_NOT_FOUND };
      if (offer.status !== "PENDING") return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_ALREADY_RESPONDED };
      if (offer.expiresAt <= new Date()) {
        await expireDriverOffers(input.driverId, new Date(), tx);
        return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_EXPIRED };
      }
      const driver = await tx.driver.findUnique({ where: { id: input.driverId } });
      if (!driver || driver.status !== "ACTIVE" || !driver.isOnline || driver.isOnTrip) {
        return { ok: false as const, code: DRIVER_ERROR_CODES.DRIVER_NOT_AVAILABLE };
      }
      if (await findConflictingActiveTrip(input.driverId, undefined, tx)) {
        return { ok: false as const, code: DRIVER_ERROR_CODES.CONFLICTING_ACTIVE_TRIP };
      }
      const acceptanceBooking = await tx.booking.findUnique({ where: { id: offer.bookingId } });
      const dispatchConfig = getDispatchConfig();
      if (acceptanceBooking?.dispatchStatus === "SEARCHING_DRIVER" && dispatchConfig.ok) {
        const compatibility = driverCompatibility({
          booking: acceptanceBooking, driver, hasConflictingTrip: false, attempted: false,
          now: new Date(), locationMaxAgeSeconds: dispatchConfig.config.locationMaxAgeSeconds,
        });
        if (!compatibility.eligible) {
          return { ok: false as const, code: compatibility.reason === "DRIVER_BUSY" ? DRIVER_ERROR_CODES.CONFLICTING_ACTIVE_TRIP : DRIVER_ERROR_CODES.DRIVER_NOT_AVAILABLE };
        }
      }
      const now = new Date();
      const claimedOffer = await tx.rideRequest.updateMany({
        where: { id: input.offerId, driverId: input.driverId, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "ACCEPTED", respondedAt: now },
      });
      if (claimedOffer.count !== 1) throw new DriverConflict(DRIVER_ERROR_CODES.OFFER_EXPIRED);
      const claimedBooking = await tx.booking.updateMany({ where: { id: offer.bookingId, ...ELIGIBLE },
        data: { driverId: input.driverId, status: "ASSIGNED", dispatchStatus: "ACCEPTED", acceptedAt: now } });
      if (claimedBooking.count !== 1) throw new DriverConflict(DRIVER_ERROR_CODES.BOOKING_ALREADY_CLAIMED);
      // The shared driver document also serializes simultaneous accepts for different bookings.
      const claimedDriver = await tx.driver.updateMany({ where: { id: input.driverId, status: "ACTIVE", isOnline: true, isOnTrip: false },
        data: { isOnTrip: true } });
      if (claimedDriver.count !== 1) throw new DriverConflict(DRIVER_ERROR_CODES.CONFLICTING_ACTIVE_TRIP);
      await tx.rideRequest.updateMany({ where: { bookingId: offer.bookingId, id: { not: input.offerId }, status: "PENDING" },
        data: { status: "CANCELLED", respondedAt: now } });
      await writeOutboxEvent(tx, { eventType: "DRIVER_OFFER_ACCEPTED", aggregateType: "Booking", aggregateId: offer.bookingId,
        payload: { bookingId: offer.bookingId, driverId: input.driverId, offerId: input.offerId },
        idempotencyKey: "offer-accepted:" + input.offerId });
      return { ok: true as const, bookingId: offer.bookingId, offerId: input.offerId };
    });
  } catch (error) { return transactionFailure(error); }
}
export async function declineDriverOffer(offerId: string, driverId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const offer = await tx.rideRequest.findUnique({ where: { id: offerId } });
      if (!offer || offer.driverId !== driverId) return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_NOT_FOUND };
      if (offer.status !== "PENDING") return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_ALREADY_RESPONDED };
      const now = new Date();
      if (offer.expiresAt <= now) {
        await expireDriverOffers(driverId, now, tx);
        return { ok: false as const, code: DRIVER_ERROR_CODES.OFFER_EXPIRED };
      }
      const changed = await tx.rideRequest.updateMany({ where: { id: offerId, driverId, status: "PENDING", expiresAt: { gt: now } },
        data: { status: "DECLINED", respondedAt: now } });
      if (changed.count !== 1) throw new DriverConflict("STATE_CONFLICT");
      await writeOutboxEvent(tx, { eventType: "DRIVER_OFFER_DECLINED", aggregateType: "Booking", aggregateId: offer.bookingId,
        payload: { bookingId: offer.bookingId, driverId, offerId }, idempotencyKey: "offer-declined:" + offerId });
      return { ok: true as const, offerId, bookingId: offer.bookingId };
    });
  } catch (error) { return transactionFailure(error); }
}
export async function transitionDriverBooking(input: {
  bookingId: string; driverId: string; command: "ENROUTE" | "ARRIVED" | "START" | "COMPLETE"; cashConfirmed?: boolean;
}) {
  const targetByCommand = { ENROUTE: "DRIVER_ENROUTE", ARRIVED: "ARRIVED", START: "IN_PROGRESS", COMPLETE: "COMPLETED" };
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking || booking.driverId !== input.driverId) return { ok: false as const, code: DRIVER_ERROR_CODES.BOOKING_NOT_FOUND };
      const target = targetByCommand[input.command];
      if (!canTransitionTrip(booking.status, target)) return { ok: false as const, code: DRIVER_ERROR_CODES.INVALID_TRANSITION };
      if (input.command === "START" && booking.paymentMethod === "CASH" && !input.cashConfirmed) {
        return { ok: false as const, code: DRIVER_ERROR_CODES.INVALID_REQUEST };
      }
      const changed = await tx.booking.updateMany({ where: { id: input.bookingId, driverId: input.driverId, status: booking.status },
        data: { status: target, dispatchStatus: "ACCEPTED",
          ...(input.command === "START" && booking.paymentMethod === "CASH" && input.cashConfirmed ? { cashAgreed: true } : {}) } });
      if (changed.count !== 1) throw new DriverConflict(DRIVER_ERROR_CODES.INVALID_TRANSITION);
      if (input.command === "COMPLETE") {
        // Financial failure must roll back completion, busy release and event together.
        await createOrUpdateDriverEarningForBooking(input.bookingId, tx);
        if ("driverLedgerEntry" in tx) {
          const ledger = await postTripEarningLedger(input.bookingId, tx);
          if (!ledger.ok) throw new DriverConflict("LEDGER_POST_FAILED");
        }
        const conflict = await findConflictingActiveTrip(input.driverId, input.bookingId, tx);
        await tx.driver.update({ where: { id: input.driverId }, data: { isOnTrip: Boolean(conflict) } });
        await tx.rideRequest.updateMany({ where: { bookingId: input.bookingId, status: "PENDING" },
          data: { status: "EXPIRED", respondedAt: new Date() } });
      } else {
        await tx.driver.update({ where: { id: input.driverId }, data: { isOnTrip: true } });
      }
      await writeOutboxEvent(tx, { eventType: "DRIVER_TRIP_" + input.command, aggregateType: "Booking", aggregateId: input.bookingId,
        payload: { bookingId: input.bookingId, driverId: input.driverId, status: target },
        idempotencyKey: "driver-trip:" + input.command.toLowerCase() + ":" + input.bookingId });
      return { ok: true as const, status: target };
    });
  } catch (error) { return transactionFailure(error); }
}
