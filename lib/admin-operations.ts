import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { startAutomaticDispatch, startScheduledRecoveryDispatch } from "@/lib/automatic-dispatch";
import { bookingDispatchEligibility, driverCompatibility } from "@/lib/dispatch-matching";
import { assertScheduledRouteFeasible, releaseScheduledAssignment, scheduledDriverCompatibility } from "@/lib/scheduled-marketplace";
import { evaluateDriverPresence, isLocationFresh } from "@/lib/driver-state";
import { SCHEDULED_MARKET_CONFIG } from "@/lib/scheduled-marketplace";
import { writeOutboxEvent } from "@/lib/outbox";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "ASSIGNED", "CONFIRMED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS", "SEARCHING_DRIVER"];
const ASSIGNABLE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"];
const TERMINAL_BOOKING_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export const ADMIN_OPERATION_CODES = {
  BOOKING_NOT_FOUND: "BOOKING_NOT_FOUND",
  DRIVER_NOT_FOUND: "DRIVER_NOT_FOUND",
  BOOKING_NOT_ASSIGNABLE: "BOOKING_NOT_ASSIGNABLE",
  BOOKING_ALREADY_ASSIGNED: "BOOKING_ALREADY_ASSIGNED",
  DRIVER_INELIGIBLE: "DRIVER_INELIGIBLE",
  DRIVER_SCHEDULE_CONFLICT: "DRIVER_SCHEDULE_CONFLICT",
  ACTIVE_OFFER_CONFLICT: "ACTIVE_OFFER_CONFLICT",
  DISPATCH_ALREADY_ACTIVE: "DISPATCH_ALREADY_ACTIVE",
  DISPATCH_NOT_ALLOWED: "DISPATCH_NOT_ALLOWED",
  RELEASE_NOT_ALLOWED: "RELEASE_NOT_ALLOWED",
  STATE_CONFLICT: "STATE_CONFLICT",
  AUDIT_REASON_REQUIRED: "AUDIT_REASON_REQUIRED",
  OUTBOX_RETRY_NOT_ALLOWED: "OUTBOX_RETRY_NOT_ALLOWED",
  INVALID_REQUEST: "INVALID_REQUEST",
} as const;

export function boundedPage(value: string | null, fallback = 25) {
  const parsed = Number(value || fallback);
  return Number.isSafeInteger(parsed) ? Math.min(Math.max(parsed, 1), 50) : fallback;
}

export function boundedText(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[<>]/g, "").slice(0, max);
}

export function requireReason(value: unknown) {
  const reason = boundedText(value, 500);
  return reason.length >= 3 ? reason : null;
}

function requestKey(value: unknown) {
  const key = boundedText(value, 120);
  return key.length >= 8 ? key : null;
}

export function operationalPresence(driver: any, now = new Date()) {
  return evaluateDriverPresence({
    isOnline: Boolean(driver.isOnline),
    isOnTrip: Boolean(driver.isOnTrip),
    lastLocationReceivedAt: driver.lastLocationReceivedAt,
    now,
    maxLocationAgeMs: SCHEDULED_MARKET_CONFIG.locationMaxAgeSeconds * 1000,
  });
}

export function deriveOperationalAlerts(input: {
  unassignedImmediate: number;
  searching: number;
  exhausted: number;
  staleAssigned: number;
  scheduledAttention: number;
  failedOutbox: number;
  staleOffers: number;
}) {
  const alerts: Array<{ type: string; severity: "INFO" | "WARNING" | "CRITICAL"; count: number; targetType: string }> = [];
  if (input.exhausted) alerts.push({ type: "DISPATCH_EXHAUSTED", severity: "CRITICAL", count: input.exhausted, targetType: "Booking" });
  if (input.failedOutbox) alerts.push({ type: "FAILED_OUTBOX_EVENT", severity: "CRITICAL", count: input.failedOutbox, targetType: "OutboxEvent" });
  if (input.unassignedImmediate) alerts.push({ type: "UNASSIGNED_IMMEDIATE_RIDE", severity: "WARNING", count: input.unassignedImmediate, targetType: "Booking" });
  if (input.staleAssigned) alerts.push({ type: "STALE_ASSIGNED_DRIVER", severity: "WARNING", count: input.staleAssigned, targetType: "Booking" });
  if (input.scheduledAttention) alerts.push({ type: "SCHEDULED_READINESS_FAILED", severity: "WARNING", count: input.scheduledAttention, targetType: "Booking" });
  if (input.staleOffers) alerts.push({ type: "STALE_ACTIVE_OFFER", severity: "WARNING", count: input.staleOffers, targetType: "RideRequest" });
  if (input.searching) alerts.push({ type: "SEARCHING_DRIVER", severity: "INFO", count: input.searching, targetType: "Booking" });
  return alerts;
}

export async function getOperationsOverview(now = new Date()) {
  const [activeRides, unassignedImmediate, searching, exhausted, upcomingScheduled, scheduledAttention, onlineDrivers, activeDriverRows, failedOutbox, staleOffers] = await Promise.all([
    prisma.booking.count({ where: { status: { in: ["ASSIGNED", "CONFIRMED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS"] } } }),
    prisma.booking.count({ where: { status: { in: ["PENDING", "CONFIRMED"] }, scheduledRide: false, driverId: null } }),
    prisma.booking.count({ where: { dispatchStatus: "SEARCHING_DRIVER", status: { notIn: TERMINAL_BOOKING_STATUSES } } }),
    prisma.booking.count({ where: { dispatchStatus: { in: ["DISPATCH_EXHAUSTED", "NO_DRIVER_AVAILABLE"] }, status: { notIn: TERMINAL_BOOKING_STATUSES } } }),
    prisma.booking.count({ where: { scheduledRide: true, pickupAt: { gt: now }, status: { notIn: TERMINAL_BOOKING_STATUSES } } }),
    prisma.outboxEvent.count({ where: { eventType: "SCHEDULED_READINESS_FAILED", createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    prisma.driver.count({ where: { status: "ACTIVE", isOnline: true } }),
    prisma.driver.findMany({ where: { status: "ACTIVE" }, select: { id: true, isOnline: true, isOnTrip: true, lastLocationReceivedAt: true }, take: 500 }),
    prisma.outboxEvent.count({ where: { state: "FAILED" } }),
    prisma.rideRequest.count({ where: { status: "PENDING", expiresAt: { lte: now } } }),
  ]);
  const presence = activeDriverRows.reduce((acc: Record<string, number>, row: any) => {
    const state = operationalPresence(row, now);
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  const staleAssigned = await prisma.booking.count({ where: { status: { in: ["ASSIGNED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS"] }, driverId: { not: null } } });
  const alerts = deriveOperationalAlerts({ unassignedImmediate, searching, exhausted, staleAssigned: staleAssigned && presence.LOCATION_NOT_READY ? Math.min(staleAssigned, presence.LOCATION_NOT_READY) : 0, scheduledAttention, failedOutbox, staleOffers });
  return {
    timestamp: now.toISOString(),
    counts: { activeRides, unassignedImmediate, searching, exhausted, upcomingScheduled, scheduledAttention, onlineDrivers, availableDrivers: presence.AVAILABLE || 0, busyDrivers: presence.BUSY || 0, staleLocationDrivers: presence.LOCATION_NOT_READY || 0, failedOutbox, staleOffers },
    presence,
    alerts,
  };
}

function rideWhere(params: URLSearchParams) {
  const where: any = {};
  const status = boundedText(params.get("status"), 40);
  const service = boundedText(params.get("service"), 80);
  const dispatch = boundedText(params.get("dispatch"), 60);
  const driverId = boundedText(params.get("driverId"), 40);
  const search = boundedText(params.get("search"), 80);
  if (status) where.status = status;
  if (service) where.serviceType = service;
  if (dispatch) where.dispatchStatus = dispatch;
  if (driverId) where.driverId = driverId;
  if (params.get("scheduled") === "true") where.scheduledRide = true;
  if (params.get("scheduled") === "false") where.scheduledRide = false;
  if (params.get("assigned") === "true") where.driverId = { not: null };
  if (params.get("assigned") === "false") where.driverId = null;
  if (search) where.bookingRef = { contains: search, mode: "insensitive" };
  return where;
}

export async function listOperationalRides(params: URLSearchParams) {
  const take = boundedPage(params.get("limit"));
  const cursor = boundedText(params.get("cursor"), 40) || null;
  const rows = await prisma.booking.findMany({
    where: rideWhere(params),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true, bookingRef: true, serviceType: true, status: true, dispatchStatus: true,
      scheduledRide: true, scheduledDate: true, scheduledTime: true, pickupAt: true, marketTimezone: true,
      paymentMethod: true, passengerCount: true, luggageType: true, wheelchairNeeded: true, wavRequired: true,
      assistanceLevel: true, driverId: true, driver: { select: { id: true, fullName: true, status: true, isOnline: true, isOnTrip: true, lastLocationReceivedAt: true, vehicle: { select: { type: true, plateNumber: true } } } },
      rideRequests: { where: { status: "PENDING" }, take: 3, select: { id: true, driverId: true, expiresAt: true, status: true } },
      ledgerEntries: { take: 1, orderBy: { effectiveAt: "desc" }, select: { id: true, entryType: true, currency: true, grossAmountMinor: true, commissionAmountMinor: true, netAmountMinor: true, idempotencyKey: true, referenceId: true } },
    },
  });
  const hasMore = rows.length > take;
  const entries = hasMore ? rows.slice(0, take) : rows;
  return { entries, nextCursor: hasMore ? entries[entries.length - 1]?.id || null : null };
}

export async function listOperationalDrivers(params: URLSearchParams, now = new Date()) {
  const take = boundedPage(params.get("limit"));
  const cursor = boundedText(params.get("cursor"), 40) || null;
  const state = boundedText(params.get("state"), 40);
  const search = boundedText(params.get("search"), 80);
  const where: any = { status: "ACTIVE" };
  if (search) where.fullName = { contains: search, mode: "insensitive" };
  const rows = await prisma.driver.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true, fullName: true, status: true, isOnline: true, isOnTrip: true,
      currentLat: true, currentLng: true, lastLocationReceivedAt: true, lastHeartbeatAt: true,
      vehicleType: true, vehiclePlate: true, vehicleCapacity: true, vehicle: { select: { type: true, plateNumber: true, maxPassengers: true, wheelchairAccessible: true, status: true } },
      bookings: { where: { status: { in: [...ACTIVE_BOOKING_STATUSES] } }, take: 1, select: { id: true, bookingRef: true, status: true } },
    },
  });
  const filtered = rows.map((row: any) => ({ ...row, presenceState: operationalPresence(row, now), locationFresh: isLocationFresh(row.lastLocationReceivedAt, now, SCHEDULED_MARKET_CONFIG.locationMaxAgeSeconds * 1000), activeBooking: row.bookings?.[0] || null, bookings: undefined })).filter((row: any) => !state || row.presenceState === state);
  const hasMore = rows.length > take;
  return { entries: hasMore ? filtered.slice(0, take) : filtered, nextCursor: hasMore ? filtered[filtered.length - 1]?.id || null : null };
}

export async function listScheduledOperations(params: URLSearchParams, now = new Date()) {
  const take = boundedPage(params.get("limit"));
  const cursor = boundedText(params.get("cursor"), 40) || null;
  const rows = await prisma.booking.findMany({
    where: { scheduledRide: true, pickupAt: { gt: now }, status: { notIn: TERMINAL_BOOKING_STATUSES } },
    orderBy: [{ pickupAt: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: { id: true, bookingRef: true, serviceType: true, status: true, dispatchStatus: true, pickupAt: true, scheduledDate: true, scheduledTime: true, marketTimezone: true, driverId: true, driver: { select: { id: true, fullName: true, isOnline: true, lastLocationReceivedAt: true } } },
  });
  return { entries: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]?.id || null : null };
}

export async function listLedgerSupport(params: URLSearchParams) {
  const take = boundedPage(params.get("limit"));
  const where: any = {};
  const driverId = boundedText(params.get("driverId"), 40);
  const bookingId = boundedText(params.get("bookingId"), 40);
  if (driverId) where.driverId = driverId;
  if (bookingId) where.bookingId = bookingId;
  return prisma.driverLedgerEntry.findMany({ where, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }], take, select: { id: true, driverId: true, bookingId: true, entryType: true, currency: true, grossAmountMinor: true, commissionAmountMinor: true, netAmountMinor: true, referenceType: true, referenceId: true, idempotencyKey: true, effectiveAt: true, createdAt: true } });
}

export async function listAdminAudit(params: URLSearchParams) {
  const take = boundedPage(params.get("limit"));
  const where: any = {};
  const action = boundedText(params.get("action"), 80);
  const targetType = boundedText(params.get("targetType"), 80);
  const targetId = boundedText(params.get("targetId"), 80);
  const adminId = boundedText(params.get("adminId"), 40);
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (adminId) where.adminId = adminId;
  const rows = await prisma.adminAuditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select: { id: true, adminId: true, action: true, targetType: true, targetId: true, reason: true, requestId: true, outcome: true, createdAt: true } });
  return rows;
}

async function existingAudit(requestId: string) {
  return prisma.adminAuditEvent.findUnique({ where: { requestId } });
}

async function recordAudit(tx: any, data: { adminId: string; action: string; targetType: string; targetId: string; reason: string; requestId: string; outcome: string; safeMetadata?: Record<string, unknown> | null }) {
  try {
    return await tx.adminAuditEvent.create({ data: { ...data, safeMetadata: data.safeMetadata || undefined } });
  } catch (error: any) {
    if (error?.code === "P2002") return tx.adminAuditEvent.findUnique({ where: { requestId: data.requestId } });
    throw error;
  }
}

function operationError(code: string, details?: Record<string, unknown>) {
  return { ok: false as const, code, ...(details || {}) };
}

export async function retryAdminDispatch(input: { bookingId: string; reason: string; requestId: string }, adminId: string) {
  const replay = await existingAudit(input.requestId);
  if (replay) return { ok: true as const, replayed: true, outcome: replay.outcome, auditId: replay.id };
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId }, select: { id: true, status: true, driverId: true, scheduledRide: true, dispatchStatus: true, paymentMethod: true, pickupLat: true, pickupLng: true } });
  if (!booking) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_FOUND);
  const eligible = bookingDispatchEligibility(booking, { allowScheduled: Boolean(booking.scheduledRide) });
  if (!eligible.eligible) return operationError(ADMIN_OPERATION_CODES.DISPATCH_NOT_ALLOWED, { reasonCode: eligible.reason });
  const result = booking.scheduledRide ? await startScheduledRecoveryDispatch(input.bookingId) : await startAutomaticDispatch(input.bookingId);
  if (!result.ok) return operationError((result as any).code || ADMIN_OPERATION_CODES.DISPATCH_NOT_ALLOWED);
  const audit = await recordAudit(prisma, { adminId, action: "DISPATCH_RETRY", targetType: "Booking", targetId: input.bookingId, reason: input.reason, requestId: input.requestId, outcome: "SUCCESS", safeMetadata: { outcome: (result as any).outcome || "STARTED" } });
  return { ok: true as const, replayed: false, outcome: (result as any).outcome || "STARTED", auditId: audit.id };
}

function validateDriverAgainstBooking(booking: any, driver: any, now = new Date()) {
  if (!driver || driver.status !== "ACTIVE") return ADMIN_OPERATION_CODES.DRIVER_INELIGIBLE;
  const compatibility = driverCompatibility({ booking, driver, hasConflictingTrip: Boolean(driver.isOnTrip), attempted: false, now, locationMaxAgeSeconds: SCHEDULED_MARKET_CONFIG.locationMaxAgeSeconds, requireOnline: false, requireFreshLocation: false, rejectBusy: true });
  if (!compatibility.eligible) return compatibility.reason;
  if (booking.scheduledRide) {
    const scheduled = scheduledDriverCompatibility(booking, driver, now);
    if (!scheduled.eligible) return scheduled.code;
  }
  return null;
}

export async function assignAdminDriver(input: { bookingId: string; driverId: string; reason: string; requestId: string }, adminId: string) {
  const replay = await existingAudit(input.requestId);
  if (replay) return { ok: true as const, replayed: true, outcome: replay.outcome, auditId: replay.id };
  const [booking, driver] = await Promise.all([
    prisma.booking.findUnique({ where: { id: input.bookingId }, include: { driver: true } }),
    prisma.driver.findUnique({ where: { id: input.driverId }, include: { vehicle: true } }),
  ]);
  if (!booking) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_FOUND);
  if (booking.driverId) return operationError(ADMIN_OPERATION_CODES.BOOKING_ALREADY_ASSIGNED);
  if (!ASSIGNABLE_BOOKING_STATUSES.includes(booking.status)) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_ASSIGNABLE);
  const driverError = validateDriverAgainstBooking(booking, driver);
  if (driverError) return operationError(driverError);
  if (booking.scheduledRide) {
    try { await assertScheduledRouteFeasible({ db: prisma, driver, booking }); } catch (error: any) { return operationError(error?.message || ADMIN_OPERATION_CODES.DRIVER_SCHEDULE_CONFLICT); }
  }
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const current = await tx.booking.findUnique({ where: { id: input.bookingId }, include: { driver: true } });
      if (!current) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_FOUND);
      if (current.driverId) return operationError(ADMIN_OPERATION_CODES.BOOKING_ALREADY_ASSIGNED);
      if (!ASSIGNABLE_BOOKING_STATUSES.includes(current.status)) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_ASSIGNABLE);
      const currentDriver = await tx.driver.findUnique({ where: { id: input.driverId }, include: { vehicle: true } });
      const currentError = validateDriverAgainstBooking(current, currentDriver);
      if (currentError) return operationError(currentError);
      const claimedDriver = await tx.driver.updateMany({ where: { id: input.driverId, status: "ACTIVE", isOnTrip: false }, data: { isOnTrip: true } });
      if (claimedDriver.count !== 1) return operationError(ADMIN_OPERATION_CODES.STATE_CONFLICT);
      const changed = await tx.booking.updateMany({ where: { id: input.bookingId, driverId: null, status: { in: ASSIGNABLE_BOOKING_STATUSES } }, data: { driverId: input.driverId, dispatchStatus: "ACCEPTED", status: "ASSIGNED", acceptedAt: new Date() } });
      if (changed.count !== 1) return operationError(ADMIN_OPERATION_CODES.STATE_CONFLICT);
      const pending = await tx.rideRequest.findMany({ where: { bookingId: input.bookingId, status: "PENDING" }, select: { id: true, driverId: true } });
      for (const offer of pending) {
        await tx.rideRequest.updateMany({ where: { id: offer.id, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: new Date() } });
        await writeOutboxEvent(tx, { eventType: "ADMIN_OFFER_CANCELLED", aggregateType: "Booking", aggregateId: input.bookingId, idempotencyKey: "admin-offer-cancelled:" + input.requestId + ":" + offer.id, payload: { bookingId: input.bookingId, offerId: offer.id, driverId: offer.driverId } });
      }
      await writeOutboxEvent(tx, { eventType: "ADMIN_MANUAL_ASSIGNMENT", aggregateType: "Booking", aggregateId: input.bookingId, idempotencyKey: "admin-assignment:" + input.requestId, payload: { bookingId: input.bookingId, driverId: input.driverId, adminId } });
      const audit = await recordAudit(tx, { adminId, action: "MANUAL_ASSIGNMENT", targetType: "Booking", targetId: input.bookingId, reason: input.reason, requestId: input.requestId, outcome: "SUCCESS", safeMetadata: { driverId: input.driverId } });
      return { ok: true as const, replayed: false, auditId: audit.id, status: "ASSIGNED" };
    });
    return result;
  } catch (error: any) {
    if (error?.code === "P2034") return operationError(ADMIN_OPERATION_CODES.STATE_CONFLICT);
    return operationError(ADMIN_OPERATION_CODES.STATE_CONFLICT);
  }
}

export async function releaseAdminScheduledAssignment(input: { bookingId: string; reason: string; requestId: string }, adminId: string) {
  const replay = await existingAudit(input.requestId);
  if (replay) return { ok: true as const, replayed: true, outcome: replay.outcome, auditId: replay.id };
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking) return operationError(ADMIN_OPERATION_CODES.BOOKING_NOT_FOUND);
      if (!booking.scheduledRide || !booking.driverId) return operationError(ADMIN_OPERATION_CODES.RELEASE_NOT_ALLOWED);
      const released = await releaseScheduledAssignment(tx, booking, input.reason);
      if (!released.ok) return operationError(released.code);
      const audit = await recordAudit(tx, { adminId, action: "SCHEDULED_ASSIGNMENT_RELEASE", targetType: "Booking", targetId: input.bookingId, reason: input.reason, requestId: input.requestId, outcome: "SUCCESS", safeMetadata: { previousDriverId: booking.driverId } });
      return { ok: true as const, replayed: false, auditId: audit.id, status: "RELEASED" };
    });
    return result;
  } catch (error: any) {
    if (error?.code === "P2034") return operationError(ADMIN_OPERATION_CODES.STATE_CONFLICT);
    return operationError(ADMIN_OPERATION_CODES.RELEASE_NOT_ALLOWED);
  }
}
