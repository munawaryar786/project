import { prisma } from "@/lib/prisma";
import { ACTIVE_TRIP_STATUSES } from "@/lib/driver-state";
import { writeOutboxEvent } from "@/lib/outbox";
import { createDriverOfferInTransaction } from "@/lib/driver-operations";
import { getDispatchConfig, type DispatchConfig } from "@/lib/dispatch-config";
import { bookingDispatchEligibility, driverCompatibility, rankDrivers, DISPATCH_REASON } from "@/lib/dispatch-matching";

const TERMINAL_OFFER_STATUSES = ["DECLINED", "REJECTED", "EXPIRED", "CANCELLED", "ACCEPTED"];
const DRIVER_SELECT = {
  id: true, status: true, isOnline: true, isOnTrip: true,
  currentLat: true, currentLng: true, lastLocationReceivedAt: true,
  vehicleType: true, vehicleCapacity: true,
  vehicle: { select: { id: true, type: true, maxPassengers: true, wheelchairAccessible: true, status: true, isRental: true, rentalStatus: true } },
} as const;

type Db = any;

function outcomeLog(outcome: string, data: Record<string, unknown>) {
  console.info("[dispatch]", { outcome, ...data });
}

async function expireOffersForBooking(tx: Db, bookingId: string, now: Date) {
  const expired = await tx.rideRequest.findMany({
    where: { bookingId, status: "PENDING", expiresAt: { lte: now } },
    select: { id: true, driverId: true },
  });
  for (const offer of expired) {
    const changed = await tx.rideRequest.updateMany({
      where: { id: offer.id, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", respondedAt: now },
    });
    if (changed.count === 1) {
      await writeOutboxEvent(tx, {
        eventType: "OFFER_EXPIRED",
        aggregateType: "Booking",
        aggregateId: bookingId,
        payload: { bookingId, offerId: offer.id, driverId: offer.driverId },
        idempotencyKey: "offer-expired:" + offer.id,
      });
    }
  }
  return expired.length;
}

async function candidateDrivers(tx: Db, booking: any, config: DispatchConfig, now: Date) {
  const previous = await tx.rideRequest.findMany({
    where: { bookingId: booking.id, status: { in: TERMINAL_OFFER_STATUSES } },
    select: { driverId: true },
  });
  const attempted = new Set(previous.map((row: any) => row.driverId));
  const drivers = await tx.driver.findMany({
    where: { status: "ACTIVE", isOnline: true, isOnTrip: false, ...(attempted.size ? { id: { notIn: [...attempted] } } : {}) },
    select: DRIVER_SELECT,
  });
  const active = await tx.booking.findMany({
    where: { driverId: { in: drivers.map((driver: any) => driver.id) }, status: { in: [...ACTIVE_TRIP_STATUSES] } },
    select: { driverId: true },
  });
  const busy = new Set(active.map((row: any) => row.driverId));
  const eligible = drivers.filter((driver: any) => driverCompatibility({
    booking, driver, hasConflictingTrip: busy.has(driver.id), attempted: attempted.has(driver.id),
    now, locationMaxAgeSeconds: config.locationMaxAgeSeconds,
  }).eligible);
  return { attempted, eligible, ranked: rankDrivers(booking, eligible) };
}

async function claimDispatch(tx: Db, bookingId: string, allowedStates: string[]) {
  const changed = await tx.booking.updateMany({
    where: { id: bookingId, dispatchStatus: { in: allowedStates }, OR: [{ driverId: null }, { driverId: { isSet: false } }] },
    data: { dispatchStatus: "DISPATCHING" },
  });
  return changed.count === 1;
}

async function runCycle(tx: Db, bookingId: string, config: DispatchConfig, allowInitial: boolean) {
  const now = new Date();
  const booking = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false as const, code: "BOOKING_NOT_FOUND" };
  const eligibility = bookingDispatchEligibility(booking);
  if (!eligibility.eligible) return { ok: false as const, code: eligibility.reason };
  const pending = await tx.rideRequest.findFirst({
    where: { bookingId, status: "PENDING", expiresAt: { gt: now } },
    select: { id: true, driverId: true, expiresAt: true },
  });
  if (pending) return { ok: true as const, outcome: "OFFER_PENDING", offerId: pending.id };
  await expireOffersForBooking(tx, bookingId, now);
  if (booking.dispatchStatus === "DISPATCHING") {
    return { ok: false as const, code: DISPATCH_REASON.DISPATCH_STATE_CONFLICT };
  }
  if (["DISPATCH_EXHAUSTED", "NO_DRIVER_AVAILABLE"].includes(booking.dispatchStatus || "")) {
    return { ok: true as const, outcome: "DISPATCH_EXHAUSTED" };
  }
  const initialCycle = booking.dispatchStatus === "NOT_STARTED";
  const allowedStates = allowInitial ? ["NOT_STARTED", "SEARCHING_DRIVER"] : ["SEARCHING_DRIVER"];
  if (!(await claimDispatch(tx, bookingId, allowedStates))) {
    return { ok: false as const, code: DISPATCH_REASON.DISPATCH_STATE_CONFLICT };
  }

  const candidates = await candidateDrivers(tx, booking, config, now);
  if (!candidates.ranked.length) {
    await tx.booking.updateMany({ where: { id: bookingId, dispatchStatus: "DISPATCHING" }, data: { dispatchStatus: "DISPATCH_EXHAUSTED" } });
    await writeOutboxEvent(tx, {
      eventType: "DISPATCH_EXHAUSTED", aggregateType: "Booking", aggregateId: bookingId,
      payload: { bookingId, candidatesConsidered: candidates.attempted.size },
      idempotencyKey: "dispatch-exhausted:" + bookingId,
    });
    outcomeLog("DISPATCH_EXHAUSTED", { bookingId, candidatesConsidered: candidates.attempted.size });
    return { ok: true as const, outcome: "DISPATCH_EXHAUSTED", code: DISPATCH_REASON.NO_ELIGIBLE_DRIVER };
  }

  const selected = candidates.ranked[0];
  const expiresAt = new Date(now.getTime() + config.offerTtlSeconds * 1000);
  const offerResult = await createDriverOfferInTransaction(tx, {
    bookingId, driverId: selected.driver.id, expiresAt, dispatchState: "DISPATCHING",
  });
  if (!offerResult.ok) return offerResult;
  if (initialCycle) {
    await writeOutboxEvent(tx, {
      eventType: "DISPATCH_STARTED", aggregateType: "Booking", aggregateId: bookingId,
      payload: { bookingId, candidatesConsidered: candidates.ranked.length },
      idempotencyKey: "dispatch-started:" + bookingId,
    });
  } else {
    await writeOutboxEvent(tx, {
      eventType: "DISPATCH_ADVANCED", aggregateType: "Booking", aggregateId: bookingId,
      payload: { bookingId, candidatesConsidered: candidates.ranked.length },
      idempotencyKey: "dispatch-advanced:" + bookingId + ":" + selected.driver.id,
    });
  }
  await writeOutboxEvent(tx, {
    eventType: "OFFER_CREATED",
    aggregateType: "Booking",
    aggregateId: bookingId,
    payload: { bookingId, driverId: selected.driver.id, offerId: offerResult.offer.id },
    idempotencyKey: "offer-created:" + bookingId + ":" + selected.driver.id,
  });
  outcomeLog("OFFER_CREATED", {
    bookingId, candidatesConsidered: candidates.ranked.length,
    selectedDriverId: selected.driver.id, offerId: offerResult.offer.id,
  });
  return {
    ok: true as const, outcome: "OFFER_CREATED", offerId: offerResult.offer.id,
    driverId: selected.driver.id, distanceKm: selected.distanceKm,
  };
}

export async function startAutomaticDispatch(bookingId: string, overrides?: Partial<DispatchConfig>) {
  const configResult = getDispatchConfig(overrides);
  if (!configResult.ok) return configResult;
  try {
    return await prisma.$transaction((tx) => runCycle(tx, bookingId, configResult.config, true));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return { ok: false as const, code: "DISPATCH_STATE_CONFLICT" };
    }
    console.error("[dispatch] transaction failed", { bookingId, error: error instanceof Error ? error.message : "unknown" });
    return { ok: false as const, code: "DISPATCH_TRANSACTION_UNAVAILABLE" };
  }
}

export async function advanceDispatch(bookingId: string, overrides?: Partial<DispatchConfig>) {
  const configResult = getDispatchConfig(overrides);
  if (!configResult.ok) return configResult;
  try {
    return await prisma.$transaction((tx) => runCycle(tx, bookingId, configResult.config, false));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return { ok: false as const, code: "DISPATCH_STATE_CONFLICT" };
    }
    console.error("[dispatch] advance failed", { bookingId, error: error instanceof Error ? error.message : "unknown" });
    return { ok: false as const, code: "DISPATCH_TRANSACTION_UNAVAILABLE" };
  }
}

export async function cancelPendingOffersForOffline(driverId: string) {
  const bookings = await prisma.rideRequest.findMany({
    where: { driverId, status: "PENDING" },
    select: { id: true, bookingId: true },
  });
  if (!bookings.length) return { cancelled: 0, advanced: [] as unknown[] };
  const now = new Date();
  await prisma.$transaction(async tx => {
    for (const offer of bookings) {
      const changed = await tx.rideRequest.updateMany({
        where: { id: offer.id, driverId, status: "PENDING" },
        data: { status: "CANCELLED", respondedAt: now },
      });
      if (changed.count === 1) {
        await writeOutboxEvent(tx, {
          eventType: "OFFER_CANCELLED_OFFLINE", aggregateType: "Booking", aggregateId: offer.bookingId,
          payload: { bookingId: offer.bookingId, offerId: offer.id, driverId },
          idempotencyKey: "offer-cancelled-offline:" + offer.id,
        });
      }
    }
  });
  const advanced = [];
  for (const bookingId of [...new Set(bookings.map(row => row.bookingId))]) {
    advanced.push(await advanceDispatch(bookingId));
  }
  return { cancelled: bookings.length, advanced };
}

export async function advanceExpiredOffersForDriver(driverId: string) {
  const expired = await prisma.rideRequest.findMany({
    where: { driverId, status: "PENDING", expiresAt: { lte: new Date() } },
    select: { bookingId: true },
  });
  const results = [];
  for (const bookingId of [...new Set(expired.map(row => row.bookingId))]) results.push(await advanceDispatch(bookingId));
  return results;
}
