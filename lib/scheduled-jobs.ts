import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { emitScheduledRideReminder, runScheduledReadinessCheck, scheduleScheduledRideJobs, bookingPickupAt, isScheduledBooking } from "@/lib/scheduled-marketplace";
import { createScheduledRideJobPlan, isCurrentScheduledRideJob, isWithinScheduledReminderReconciliationWindow, processCursorBatches, SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS, scheduledRideJobKind, type ScheduledRideJobKind } from "@/lib/scheduled-reminders";

export type ScheduledRideJob = { bookingId: string; pickupAtMs: number; kind: string; driverId?: string; assignedAtMs?: number; minutesBeforePickup?: number };

// Legacy T15 jobs continue to run the existing operational readiness check.
const reminderMinutes: Record<string, number> = {
  REMINDER_24H: 1440,
  REMINDER_5H: 300,
  REMINDER_1H: 60,
  REMINDER_15M: 15,
  REMINDER_ADAPTIVE: 0,
};

export async function processScheduledRideJob(job: Job<ScheduledRideJob>) {
  const { bookingId, pickupAtMs } = job.data;
  const kind = scheduledRideJobKind(String(job.name || ""), job.data.kind);
  if (kind === "LEGACY_REMINDER") return { outcome: "LEGACY_REMINDER_IGNORED" };
  if (!kind) return { outcome: "UNKNOWN_JOB_IGNORED" };

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, driverId: true, acceptedAt: true, createdAt: true, status: true, scheduledRide: true, pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true, marketTimezone: true } });
  if (!booking || !booking.driverId || !isScheduledBooking(booking, new Date(booking.acceptedAt || booking.createdAt)) || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return { outcome: "NOOP" };
  const pickupAt = bookingPickupAt(booking);
  if (!pickupAt || pickupAt.getTime() !== pickupAtMs) return { outcome: "STALE" };
  const nowMs = Date.now();
  if (pickupAtMs <= nowMs) return { outcome: "STALE" };
  if (kind === "LEGACY_READINESS" || kind === "READINESS_15M") {
    if (nowMs < pickupAtMs - 15 * 60_000) throw new Error("SCHEDULED_JOB_NOT_DUE");
  } else {
    const assignedAtMs = job.data.assignedAtMs;
    if (assignedAtMs === undefined) return { outcome: "STALE_ASSIGNMENT" };
    const target = createScheduledRideJobPlan({ assignedAtMs, pickupAtMs, nowMs: assignedAtMs }).find((item) => item.kind === kind);
    if (!target) return { outcome: "INVALID_REMINDER" };
    if (nowMs < target.runAtMs) throw new Error("SCHEDULED_JOB_NOT_DUE");
  }

  if (kind === "LEGACY_READINESS") return runScheduledReadinessCheck(bookingId, pickupAtMs);
  if (kind === "READINESS_15M") {
    if (!job.data.driverId || job.data.assignedAtMs === undefined) return { outcome: "STALE_ASSIGNMENT" };
    if (!isCurrentScheduledRideJob({ booking: { ...booking, pickupAt }, job: { bookingId, pickupAtMs, driverId: job.data.driverId, assignedAtMs: job.data.assignedAtMs }, nowMs: Date.now() })) return { outcome: "STALE_ASSIGNMENT" };
    return runScheduledReadinessCheck(bookingId, pickupAtMs, { driverId: booking.driverId, assignedAtMs: new Date(booking.acceptedAt || booking.createdAt).getTime() });
  }

  if (!job.data.driverId || job.data.assignedAtMs === undefined || !isCurrentScheduledRideJob({ booking: { ...booking, pickupAt }, job: { bookingId, pickupAtMs, driverId: job.data.driverId, assignedAtMs: job.data.assignedAtMs }, nowMs: Date.now() })) return { outcome: "STALE_ASSIGNMENT" };
  const leadMinutes = job.data.minutesBeforePickup ?? reminderMinutes[kind] ?? 0;
  const sent = await emitScheduledRideReminder({ bookingId, pickupAt, driverId: job.data.driverId, assignedAtMs: job.data.assignedAtMs, kind: kind as ScheduledRideJobKind, minutesBeforePickup: leadMinutes });
  return { outcome: sent ? "NOTIFIED" : "STALE_ASSIGNMENT" };
}

const RECONCILIATION_PAGE_SIZE = 100;
const RECONCILIATION_MAX_PAGES_PER_RUN = 5;
type PersistedPickupCursor = { pickupAt: Date; id: string };
let persistedPickupCursor: PersistedPickupCursor | null = null;
let reconstructedPickupCursor: string | null = null;
let reconciliationInFlight: Promise<number> | null = null;

function utcDateKey(value: Date) { return value.toISOString().slice(0, 10); }

async function scheduleReconciledBooking(bookingId: string) {
  try {
    await scheduleScheduledRideJobs(bookingId);
    return true;
  } catch {
    // Leave the cursor before this row so the next reconciliation retries it.
    console.error("[scheduled.reconcile.schedule-failed]");
    return false;
  }
}

async function reconcileScheduledRideJobsBatch(now: Date) {
  const horizon = new Date(now.getTime() + SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS);
  // Include legacy rows classified by their reconstructed pickup instant. The
  // scheduler is the final eligibility guard; no schema/backfill is needed.
  const shared = { driverId: { not: null }, status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] } };
  const persisted = await processCursorBatches({
    cursor: persistedPickupCursor,
    pageSize: RECONCILIATION_PAGE_SIZE,
    maxPages: RECONCILIATION_MAX_PAGES_PER_RUN,
    fetchPage: (cursor, take) => prisma.booking.findMany({
      where: { AND: [shared, { pickupAt: { gt: now, lte: horizon } }, ...(cursor ? [{ OR: [{ pickupAt: { gt: cursor.pickupAt } }, { pickupAt: cursor.pickupAt, id: { gt: cursor.id } }] }] : [])] },
      orderBy: [{ pickupAt: "asc" }, { id: "asc" }],
      select: { id: true, pickupAt: true },
      take,
    }),
    getCursor: (row) => ({ pickupAt: row.pickupAt as Date, id: row.id as string }),
    process: (row) => scheduleReconciledBooking(row.id),
  });
  persistedPickupCursor = persisted.cursor;

  // pickupAt is absent on legacy records, so use a conservative local-date
  // window (±24h around the UTC horizon) before reconstructing in the market TZ.
  const dateFrom = utcDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const dateTo = utcDateKey(new Date(horizon.getTime() + 24 * 60 * 60 * 1000));
  const reconstructed = await processCursorBatches({
    cursor: reconstructedPickupCursor,
    pageSize: RECONCILIATION_PAGE_SIZE,
    maxPages: RECONCILIATION_MAX_PAGES_PER_RUN,
    fetchPage: (cursor, take) => prisma.booking.findMany({
      where: { AND: [shared, { OR: [{ pickupAt: null }, { pickupAt: { isSet: false } }] }, { OR: [{ pickupDate: { gte: dateFrom, lte: dateTo } }, { scheduledDate: { gte: dateFrom, lte: dateTo } }] }, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
      orderBy: [{ id: "asc" }],
      select: { id: true, pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true, marketTimezone: true },
      take,
    }),
    getCursor: (row) => row.id as string,
    process: async (row) => {
      const pickupAt = bookingPickupAt(row);
      if (!isWithinScheduledReminderReconciliationWindow(pickupAt, now)) return true;
      return scheduleReconciledBooking(row.id);
    },
  });
  reconstructedPickupCursor = reconstructed.cursor;
  return persisted.processed + reconstructed.processed;
}

export async function reconcileScheduledRideJobs(now = new Date()) {
  if (reconciliationInFlight) return reconciliationInFlight;
  const run = reconcileScheduledRideJobsBatch(now);
  reconciliationInFlight = run;
  try { return await run; }
  finally { if (reconciliationInFlight === run) reconciliationInFlight = null; }
}
