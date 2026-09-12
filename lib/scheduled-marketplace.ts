import { prisma } from "@/lib/prisma";
import { computeGoogleRoute, validCoordinate } from "@/lib/navigation/routes";
import { driverCompatibility } from "@/lib/dispatch-matching";
import { isLocationFresh } from "@/lib/driver-state";
import { createNotification } from "@/lib/notifications";
import { writeOutboxEvent } from "@/lib/outbox";

export const SCHEDULED_ERROR_CODES = {
  SCHEDULED_RIDE_NOT_FOUND: "SCHEDULED_RIDE_NOT_FOUND",
  SCHEDULED_RIDE_NOT_CLAIMABLE: "SCHEDULED_RIDE_NOT_CLAIMABLE",
  SCHEDULED_RIDE_ALREADY_CLAIMED: "SCHEDULED_RIDE_ALREADY_CLAIMED",
  DRIVER_SCHEDULE_CONFLICT: "DRIVER_SCHEDULE_CONFLICT",
  ROUTE_FEASIBILITY_UNAVAILABLE: "ROUTE_FEASIBILITY_UNAVAILABLE",
  DRIVER_INELIGIBLE: "DRIVER_INELIGIBLE",
  SERVICE_INCOMPATIBLE: "SERVICE_INCOMPATIBLE",
  VEHICLE_INCOMPATIBLE: "VEHICLE_INCOMPATIBLE",
  MARKET_INCOMPATIBLE: "MARKET_INCOMPATIBLE",
  CLAIM_STATE_CONFLICT: "CLAIM_STATE_CONFLICT",
  RELEASE_NOT_ALLOWED: "RELEASE_NOT_ALLOWED",
  READINESS_FAILED: "READINESS_FAILED",
  INVALID_SCHEDULE_TIME: "INVALID_SCHEDULE_TIME",
} as const;

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export const SCHEDULED_MARKET_CONFIG = {
  timezone: process.env.DRIVO_SCHEDULED_MARKET_TIMEZONE || "Europe/Bratislava",
  bufferMinutes: positiveInteger("DRIVO_SCHEDULED_RIDE_BUFFER_MINUTES", 15),
  minClaimLeadMinutes: positiveInteger("DRIVO_SCHEDULED_MIN_CLAIM_LEAD_MINUTES", 15),
  locationMaxAgeSeconds: positiveInteger("DRIVO_DISPATCH_LOCATION_MAX_AGE_SECONDS", 120),
};

function timeZoneParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const result: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") result[part.type] = Number(part.value);
  return result;
}

function offsetAt(value: Date, timeZone: string) {
  const parts = timeZoneParts(value, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - value.getTime();
}

export function parseMarketDateTime(dateValue: unknown, timeValue: unknown, timeZone = SCHEDULED_MARKET_CONFIG.timezone) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match || !timeMatch) return null;
  const hour = Number(timeMatch[1]), minute = Number(timeMatch[2]), second = Number(timeMatch[3] || 0);
  const naive = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second);
  if (!Number.isFinite(naive)) return null;
  try {
    const first = new Date(naive - offsetAt(new Date(naive), timeZone));
    return new Date(naive - offsetAt(first, timeZone));
  } catch {
    return null;
  }
}

export function bookingPickupAt(booking: {
  pickupAt?: Date | string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  marketTimezone?: string | null;
}) {
  if (booking.pickupAt) {
    const value = new Date(booking.pickupAt);
    if (!Number.isNaN(value.getTime())) return value;
  }
  return parseMarketDateTime(
    booking.pickupDate || booking.scheduledDate,
    booking.pickupTime || booking.scheduledTime,
    booking.marketTimezone || SCHEDULED_MARKET_CONFIG.timezone,
  );
}

export function isScheduledBooking(booking: any, now = new Date()) {
  const pickupAt = bookingPickupAt(booking);
  return booking?.scheduledRide === true || Boolean(pickupAt && pickupAt.getTime() > now.getTime() + 5 * 60 * 1000);
}

export function isFutureScheduledBooking(booking: any, now = new Date()) {
  const pickupAt = bookingPickupAt(booking);
  return isScheduledBooking(booking, now) && Boolean(pickupAt && pickupAt.getTime() > now.getTime());
}

const marketplaceStates = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"] as const;
const terminalStates = ["CANCELLED", "COMPLETED", "NO_SHOW"] as const;

export function scheduledMarketplaceEligibility(booking: any, now = new Date()) {
  if (!booking || !isScheduledBooking(booking, now)) return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_CLAIMABLE };
  if (!marketplaceStates.includes(booking.status)) return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_CLAIMABLE };
  if ((terminalStates as readonly string[]).includes(booking.status) || booking.driverId) return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_ALREADY_CLAIMED };
  if (booking.paymentMethod === "CARD" && booking.status !== "CONFIRMED") return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_CLAIMABLE };
  const pickupAt = bookingPickupAt(booking);
  if (!pickupAt || pickupAt.getTime() <= now.getTime() + SCHEDULED_MARKET_CONFIG.minClaimLeadMinutes * 60 * 1000) {
    return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_CLAIMABLE };
  }
  if (!validCoordinate(booking.pickupLat, -90, 90) || !validCoordinate(booking.pickupLng, -180, 180) ||
      !validCoordinate(booking.dropoffLat, -90, 90) || !validCoordinate(booking.dropoffLng, -180, 180)) {
    return { eligible: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_CLAIMABLE };
  }
  return { eligible: true as const, pickupAt };
}

export function scheduledDriverCompatibility(booking: any, driver: any, now = new Date()) {
  const result = driverCompatibility({
    booking,
    driver,
    hasConflictingTrip: false,
    attempted: false,
    now,
    locationMaxAgeSeconds: SCHEDULED_MARKET_CONFIG.locationMaxAgeSeconds,
    requireOnline: false,
    requireFreshLocation: false,
    rejectBusy: false,
  });
  if (!result.eligible) {
    if (result.reason === "WAV_REQUIRED" || result.reason === "ACCESSIBILITY_INCOMPATIBLE") return { eligible: false as const, code: SCHEDULED_ERROR_CODES.VEHICLE_INCOMPATIBLE };
    if (result.reason === "CAPACITY_EXCEEDED" || result.reason === "LUGGAGE_INCOMPATIBLE") return { eligible: false as const, code: result.reason };
    return { eligible: false as const, code: SCHEDULED_ERROR_CODES.DRIVER_INELIGIBLE };
  }
  return { eligible: true as const };
}

type ScheduleDb = any;

async function routeSeconds(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  try {
    const route = await computeGoogleRoute({ origin, destination });
    return route.durationSeconds;
  } catch {
    throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
  }
}

function coords(row: any, prefix: "pickup" | "dropoff") {
  const lat = row[prefix + "Lat"], lng = row[prefix + "Lng"];
  return validCoordinate(lat, -90, 90) && validCoordinate(lng, -180, 180) ? { lat, lng } : null;
}

async function scheduledTripDuration(row: any) {
  const origin = coords(row, "pickup"), destination = coords(row, "dropoff");
  if (!origin || !destination) throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
  return routeSeconds(origin, destination);
}

export async function assertScheduledRouteFeasible(input: { db: ScheduleDb; driver: any; booking: any; now?: Date }) {
  const now = input.now || new Date();
  const candidatePickup = bookingPickupAt(input.booking);
  if (!candidatePickup) throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
  const neighbors = await input.db.booking.findMany({
    where: {
      driverId: input.driver.id,
      id: { not: input.booking.id },
      status: { notIn: terminalStates },
      pickupAt: { not: null },
    },
    select: {
      id: true, status: true, pickupAt: true, scheduledRide: true,
      pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true,
      distanceKm: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true,
      marketTimezone: true,
    },
  });
  const ordered = neighbors
    .map((row: any) => ({ ...row, pickup: bookingPickupAt(row) }))
    .filter((row: any) => row.pickup && row.pickup.getTime() > now.getTime())
    .sort((a: any, b: any) => a.pickup.getTime() - b.pickup.getTime());
  const previous = [...ordered].reverse().find((row: any) => row.pickup.getTime() < candidatePickup.getTime());
  const next = ordered.find((row: any) => row.pickup.getTime() > candidatePickup.getTime());

  if (input.driver.isOnTrip && !previous && candidatePickup.getTime() - now.getTime() < (SCHEDULED_MARKET_CONFIG.bufferMinutes + 45) * 60 * 1000) {
    throw new Error(SCHEDULED_ERROR_CODES.DRIVER_SCHEDULE_CONFLICT);
  }
  if (!previous && !next) return { ok: true as const, previous: null, next: null };

  const candidateOrigin = coords(input.booking, "pickup"), candidateDestination = coords(input.booking, "dropoff");
  if (!candidateOrigin || !candidateDestination) throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
  const candidateDuration = await scheduledTripDuration(input.booking);
  const bufferMs = SCHEDULED_MARKET_CONFIG.bufferMinutes * 60 * 1000;

  if (previous) {
    const previousDropoff = coords(previous, "dropoff");
    if (!previousDropoff) throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
    const previousDuration = await scheduledTripDuration(previous);
    const transfer = await routeSeconds(previousDropoff, candidateOrigin);
    const previousReadyAt = previous.pickup.getTime() + previousDuration * 1000 + transfer * 1000 + bufferMs;
    if (previousReadyAt > candidatePickup.getTime()) throw new Error(SCHEDULED_ERROR_CODES.DRIVER_SCHEDULE_CONFLICT);
  }
  if (next) {
    const nextOrigin = coords(next, "pickup");
    if (!nextOrigin) throw new Error(SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE);
    const transfer = await routeSeconds(candidateDestination, nextOrigin);
    const candidateReadyAt = candidatePickup.getTime() + candidateDuration * 1000 + transfer * 1000 + bufferMs;
    if (candidateReadyAt > next.pickup.getTime()) throw new Error(SCHEDULED_ERROR_CODES.DRIVER_SCHEDULE_CONFLICT);
  }
  return { ok: true as const, previous: previous?.id || null, next: next?.id || null };
}

export async function emitScheduledEvent(input: { bookingId: string; driverId?: string | null; eventType: string; kind: string; pickupAt?: Date | null }) {
  const key = "scheduled:" + input.kind + ":" + input.bookingId + ":" + (input.pickupAt?.getTime() || "none");
  try {
    await prisma.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: "Booking",
        aggregateId: input.bookingId,
        idempotencyKey: key,
        payload: { bookingId: input.bookingId, driverId: input.driverId || undefined, kind: input.kind },
        state: "PENDING",
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
  }
  if (input.driverId) {
    await createNotification({
      recipientType: "DRIVER",
      recipientId: input.driverId,
      type: input.kind,
      data: { bookingId: input.bookingId, pickupAt: input.pickupAt?.toISOString() || null },
      dedupeKey: key,
    });
  }
}

export async function claimScheduledRide(bookingId: string, driverId: string) {
  const now = new Date();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_FOUND };
  if (booking.driverId === driverId) return { ok: true as const, alreadyClaimed: true, booking };
  if (booking.driverId && booking.driverId !== driverId) return { ok: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_ALREADY_CLAIMED };
  const eligible = scheduledMarketplaceEligibility(booking, now);
  if (!eligible.eligible) return { ok: false as const, code: eligible.code };
  const driver = await prisma.driver.findUnique({ where: { id: driverId }, include: { vehicle: true } });
  const compatible = scheduledDriverCompatibility(booking, driver, now);
  if (!compatible.eligible) return { ok: false as const, code: compatible.code };
  try {
    await assertScheduledRouteFeasible({ db: prisma, driver, booking, now });
  } catch (error: any) {
    return { ok: false as const, code: error?.message === SCHEDULED_ERROR_CODES.DRIVER_SCHEDULE_CONFLICT ? SCHEDULED_ERROR_CODES.DRIVER_SCHEDULE_CONFLICT : SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE };
  }
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!current) return { ok: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_FOUND };
      if (current.driverId === driverId) return { ok: true as const, alreadyClaimed: true, booking: current };
      if (current.driverId) return { ok: false as const, code: SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_ALREADY_CLAIMED };
      const currentEligible = scheduledMarketplaceEligibility(current, new Date());
      if (!currentEligible.eligible) return { ok: false as const, code: SCHEDULED_ERROR_CODES.CLAIM_STATE_CONFLICT };
      const changed = await tx.booking.updateMany({
        where: { id: bookingId, driverId: null, status: { in: [...marketplaceStates] } },
        data: { driverId, dispatchStatus: "SCHEDULED_CLAIMED", acceptedAt: new Date() },
      });
      if (changed.count !== 1) return { ok: false as const, code: SCHEDULED_ERROR_CODES.CLAIM_STATE_CONFLICT };
      await writeOutboxEvent(tx, {
        eventType: "SCHEDULED_RIDE_CLAIMED",
        aggregateType: "Booking",
        aggregateId: bookingId,
        idempotencyKey: "scheduled-claimed:" + bookingId + ":" + driverId,
        payload: { bookingId, driverId },
      });
      return { ok: true as const, alreadyClaimed: false };
    });
    if (result.ok) await scheduleScheduledRideJobs(bookingId);
    return result;
  } catch (error: any) {
    if (error?.code === "P2034") return { ok: false as const, code: SCHEDULED_ERROR_CODES.CLAIM_STATE_CONFLICT };
    return { ok: false as const, code: SCHEDULED_ERROR_CODES.CLAIM_STATE_CONFLICT };
  }
}

export async function releaseScheduledAssignment(tx: any, booking: any, reason: string) {
  const now = new Date();
  const pickupAt = bookingPickupAt(booking);
  if (!pickupAt || pickupAt.getTime() <= now.getTime() + SCHEDULED_MARKET_CONFIG.minClaimLeadMinutes * 60 * 1000) {
    return { ok: false as const, code: SCHEDULED_ERROR_CODES.RELEASE_NOT_ALLOWED };
  }
  const changed = await tx.booking.updateMany({
    where: { id: booking.id, driverId: booking.driverId, status: { in: [...marketplaceStates] } },
    data: { driverId: null, dispatchStatus: "NOT_STARTED", acceptedAt: null },
  });
  if (changed.count !== 1) return { ok: false as const, code: SCHEDULED_ERROR_CODES.CLAIM_STATE_CONFLICT };
  await writeOutboxEvent(tx, {
    eventType: "SCHEDULED_RIDE_RELEASED",
    aggregateType: "Booking",
    aggregateId: booking.id,
    idempotencyKey: "scheduled-released:" + booking.id + ":" + reason + ":" + pickupAt.getTime(),
    payload: { bookingId: booking.id, reason },
  });
  return { ok: true as const };
}

export async function runScheduledReadinessCheck(bookingId: string, expectedPickupAtMs: number) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || bookingPickupAt(booking)?.getTime() !== expectedPickupAtMs || !booking.driverId) return { ok: true as const, outcome: "NOOP" };
  const driver = await prisma.driver.findUnique({ where: { id: booking.driverId }, include: { vehicle: true } });
  const pickupAt = bookingPickupAt(booking);
  if (!driver || !pickupAt || (terminalStates as readonly string[]).includes(booking.status)) return { ok: true as const, outcome: "NOOP" };
  const compatibility = scheduledDriverCompatibility(booking, driver);
  const ready = compatibility.eligible && driver.isOnline && isLocationFresh(driver.lastLocationReceivedAt, new Date(), SCHEDULED_MARKET_CONFIG.locationMaxAgeSeconds * 1000);
  let feasible = false;
  if (ready) {
    try { await assertScheduledRouteFeasible({ db: prisma, driver, booking }); feasible = true; } catch { feasible = false; }
  }
  if (ready && feasible) {
    await emitScheduledEvent({ bookingId, driverId: driver.id, eventType: "SCHEDULED_READINESS_CHECKED", kind: "SCHEDULED_READINESS_READY", pickupAt });
    return { ok: true as const, outcome: "READY" };
  }
  const result = await prisma.$transaction(async (tx: any) => {
    const current = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!current || current.driverId !== driver.id || bookingPickupAt(current)?.getTime() !== expectedPickupAtMs) return { ok: true as const, outcome: "NOOP" };
    const released = await releaseScheduledAssignment(tx, current, "READINESS_FAILED");
    if (!released.ok) return { ok: false as const, code: released.code };
    await writeOutboxEvent(tx, { eventType: "SCHEDULED_READINESS_FAILED", aggregateType: "Booking", aggregateId: bookingId, idempotencyKey: "scheduled-readiness-failed:" + bookingId + ":" + expectedPickupAtMs, payload: { bookingId, driverId: driver.id } });
    return { ok: true as const, outcome: "RELEASED" };
  });
  if (result.ok && result.outcome === "RELEASED") {
    const { startScheduledRecoveryDispatch } = await import("@/lib/automatic-dispatch");
    const recovery = await startScheduledRecoveryDispatch(bookingId);
    for (const admin of await prisma.adminUser.findMany({ select: { id: true } })) {
      await createNotification({ recipientType: "ADMIN", recipientId: admin.id, type: "SCHEDULED_READINESS_FAILED", data: { bookingId, recovery: recovery.ok }, dedupeKey: "scheduled-admin-readiness:" + bookingId + ":" + expectedPickupAtMs + ":" + admin.id });
    }
    return { ok: true as const, outcome: "RECOVERY", recovery };
  }
  return result;
}

export async function scheduleScheduledRideJobs(bookingId: string) {
  const { getScheduledRideQueue } = await import("@/lib/realtime/queues");
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, driverId: true, pickupAt: true } });
  if (!booking?.driverId || !booking.pickupAt) return;
  const pickupMs = booking.pickupAt.getTime();
  const jobs = [
    { kind: "T30", event: "SCHEDULED_REMINDER_30", minutes: 30 },
    { kind: "T20", event: "SCHEDULED_WARNING_20", minutes: 20 },
    { kind: "T15", event: "SCHEDULED_READINESS_CHECK", minutes: 15 },
  ];
  const queue = getScheduledRideQueue();
  for (const job of jobs) await queue.add(job.kind, { bookingId, pickupAtMs: pickupMs, kind: job.kind }, { jobId: "scheduled-" + job.kind.toLowerCase() + "-" + bookingId + "-" + pickupMs, delay: Math.max(0, pickupMs - job.minutes * 60 * 1000 - Date.now()) });
  return { pickupMs };
}
