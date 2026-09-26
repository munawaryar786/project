export const SCHEDULED_REMINDER_MILESTONES = [
  { kind: "REMINDER_24H", minutesBeforePickup: 24 * 60 },
  { kind: "REMINDER_5H", minutesBeforePickup: 5 * 60 },
  { kind: "REMINDER_1H", minutesBeforePickup: 60 },
  { kind: "REMINDER_15M", minutesBeforePickup: 15 },
] as const;

export type ScheduledReminderKind = typeof SCHEDULED_REMINDER_MILESTONES[number]["kind"] | "REMINDER_ADAPTIVE";
export type ScheduledRideJobKind = ScheduledReminderKind | "READINESS_15M";

export type ScheduledRideJobPlanItem = {
  kind: ScheduledRideJobKind;
  runAtMs: number;
  minutesBeforePickup: number;
};

const MINUTE_MS = 60_000;
// The first standard reminder is T-24h; five extra minutes absorb worker/reconcile jitter.
export const SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS = 24 * 60 * MINUTE_MS + 5 * MINUTE_MS;
export const SCHEDULED_REMINDER_RECENT_MILESTONE_GRACE_MS = 30_000;
// Reconciliation must not recreate an overdue operational readiness action
// forever after BullMQ removes a completed job. Keep catch-up bounded to a
// freshly committed assignment so a Driver assigned after T-15 can still be
// checked immediately, while older overdue targets stop being re-enqueued.
export const SCHEDULED_READINESS_ASSIGNMENT_CATCH_UP_GRACE_MS = 5 * MINUTE_MS;

export function isWithinScheduledReminderReconciliationWindow(pickupAt: Date | null, now: Date) {
  return Boolean(pickupAt && pickupAt.getTime() > now.getTime() && pickupAt.getTime() <= now.getTime() + SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS);
}

export async function processCursorBatches<T, C>(input: {
  cursor: C | null;
  pageSize: number;
  maxPages: number;
  fetchPage: (cursor: C | null, pageSize: number) => Promise<T[]>;
  getCursor: (row: T) => C;
  process: (row: T) => Promise<boolean>;
}) {
  let cursor = input.cursor;
  let processed = 0;
  for (let page = 0; page < input.maxPages; page++) {
    const rows = await input.fetchPage(cursor, input.pageSize);
    if (rows.length === 0) return { cursor: null as C | null, processed, exhausted: true };
    for (const row of rows) {
      if (!(await input.process(row))) return { cursor, processed, exhausted: false };
      cursor = input.getCursor(row);
      processed++;
    }
    if (rows.length < input.pageSize) return { cursor: null as C | null, processed, exhausted: true };
  }
  return { cursor, processed, exhausted: false };
}

/** Deterministic reminder plan; all inputs are absolute epoch milliseconds. */
export function createScheduledRideJobPlan(input: {
  assignedAtMs: number;
  pickupAtMs: number;
  nowMs: number;
}): ScheduledRideJobPlanItem[] {
  const { assignedAtMs, pickupAtMs, nowMs } = input;
  if (![assignedAtMs, pickupAtMs, nowMs].every((value) => Number.isFinite(value) && Number.isFinite(new Date(value).getTime())) || assignedAtMs > nowMs || pickupAtMs <= assignedAtMs || pickupAtMs <= nowMs) return [];

  const plan: ScheduledRideJobPlanItem[] = SCHEDULED_REMINDER_MILESTONES
    .map((milestone) => ({
      kind: milestone.kind,
      runAtMs: pickupAtMs - milestone.minutesBeforePickup * MINUTE_MS,
      minutesBeforePickup: milestone.minutesBeforePickup,
    }))
    .filter((item) => item.runAtMs > nowMs && item.runAtMs < pickupAtMs);

  const remainingAtAssignment = pickupAtMs - assignedAtMs;
  const oneHourAt = pickupAtMs - 60 * MINUTE_MS;
  let adaptiveAt: number | null = null;

  if (remainingAtAssignment > 60 * MINUTE_MS && remainingAtAssignment < 5 * 60 * MINUTE_MS) {
    const midpoint = assignedAtMs + (oneHourAt - assignedAtMs) / 2;
    if (
      midpoint >= assignedAtMs + 10 * MINUTE_MS &&
      midpoint <= oneHourAt - 10 * MINUTE_MS &&
      midpoint > nowMs &&
      midpoint < pickupAtMs &&
      !SCHEDULED_REMINDER_MILESTONES.some((milestone) => pickupAtMs - milestone.minutesBeforePickup * MINUTE_MS === midpoint)
    ) adaptiveAt = midpoint;
  } else if (remainingAtAssignment > 30 * MINUTE_MS && remainingAtAssignment <= 60 * MINUTE_MS) {
    const thirtyMinuteAt = pickupAtMs - 30 * MINUTE_MS;
    if (thirtyMinuteAt > nowMs) adaptiveAt = thirtyMinuteAt;
  }

  if (adaptiveAt !== null) {
    plan.push({ kind: "REMINDER_ADAPTIVE", runAtMs: adaptiveAt, minutesBeforePickup: Math.round((pickupAtMs - adaptiveAt) / MINUTE_MS) });
  }

  // Readiness is an operational check, separate from the T-15 reminder. Keep
  // normal future jobs and a bounded immediate catch-up for a newly assigned
  // Driver when assignment itself occurred at/after T-15. Reconciliation must
  // not recreate an old completed readiness job after BullMQ retention removes it.
  const readinessAt = pickupAtMs - 15 * MINUTE_MS;
  const readinessIsFuture = readinessAt > nowMs;
  const readinessIsFreshAssignmentCatchUp =
    readinessAt <= nowMs &&
    assignedAtMs <= nowMs &&
    nowMs - assignedAtMs <= SCHEDULED_READINESS_ASSIGNMENT_CATCH_UP_GRACE_MS;
  if (readinessIsFuture || readinessIsFreshAssignmentCatchUp) {
    plan.push({ kind: "READINESS_15M", runAtMs: readinessAt, minutesBeforePickup: 15 });
  }
  return plan.sort((a, b) => a.runAtMs - b.runAtMs || a.kind.localeCompare(b.kind));
}

/**
 * Preserve a reminder milestone that crossed during the outbox's short delivery
 * jitter after assignment. Readiness remains separate and is never folded into
 * reminder catch-up; pickup/terminal checks still run when the job executes.
 */
export function createScheduledRideJobPlanWithRecentMilestones(input: {
  assignedAtMs: number;
  pickupAtMs: number;
  nowMs: number;
  graceMs?: number;
}) {
  const plan = createScheduledRideJobPlan(input);
  if (![input.assignedAtMs, input.pickupAtMs, input.nowMs].every(Number.isFinite) || input.pickupAtMs <= input.nowMs || input.assignedAtMs > input.nowMs) return plan;
  const graceMs = input.graceMs ?? SCHEDULED_REMINDER_RECENT_MILESTONE_GRACE_MS;
  if (input.nowMs <= input.assignedAtMs || input.nowMs - input.assignedAtMs > graceMs) return plan;
  const recentlyPassed = createScheduledRideJobPlan({ ...input, nowMs: input.assignedAtMs })
    .filter((item) => item.kind.startsWith("REMINDER_") && item.runAtMs <= input.nowMs && item.runAtMs > input.nowMs - graceMs);
  const unique = new Map([...plan, ...recentlyPassed].map((item) => [`${item.kind}:${item.runAtMs}`, item]));
  return [...unique.values()].sort((a, b) => a.runAtMs - b.runAtMs || a.kind.localeCompare(b.kind));
}

export function scheduledReminderDedupeKey(input: {
  bookingId: string;
  pickupAtMs: number;
  driverId: string;
  assignedAtMs: number;
  kind: ScheduledRideJobKind;
}) {
  return `scheduled:${input.kind}:${input.bookingId}:${input.pickupAtMs}:${input.driverId}:${input.assignedAtMs}`;
}

export function scheduledRideJobId(input: {
  bookingId: string;
  pickupAtMs: number;
  driverId: string;
  assignedAtMs: number;
  kind: ScheduledRideJobKind;
  runAtMs: number;
}) {
  return ["scheduled", input.bookingId, input.pickupAtMs, input.driverId, input.assignedAtMs, input.kind, input.runAtMs].join("-");
}

export function isCurrentScheduledRideJob(input: {
  booking: { driverId?: string | null; acceptedAt?: Date | string | null; createdAt?: Date | string | null; status?: string; scheduledRide?: boolean; pickupAt?: Date | string | null };
  job: { bookingId: string; pickupAtMs: number; driverId?: string; assignedAtMs?: number };
  nowMs: number;
}) {
  const { booking, job, nowMs } = input;
  if (!Number.isFinite(nowMs) || !Number.isFinite(job.pickupAtMs)) return false;
  if (!booking.driverId || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(String(booking.status))) return false;
  const pickupAtMs = booking.pickupAt ? new Date(booking.pickupAt).getTime() : NaN;
  if (!Number.isFinite(pickupAtMs) || pickupAtMs !== job.pickupAtMs || pickupAtMs <= nowMs) return false;
  const assignmentTimestamp = booking.acceptedAt || booking.createdAt;
  const assignedAtMs = assignmentTimestamp ? new Date(assignmentTimestamp).getTime() : NaN;
  if (!Number.isFinite(assignedAtMs) || assignedAtMs > nowMs || assignedAtMs >= pickupAtMs) return false;
  // Legacy scheduled classification must not change as the clock approaches pickup.
  if (!booking.scheduledRide && (!Number.isFinite(assignedAtMs) || pickupAtMs <= assignedAtMs + 5 * MINUTE_MS)) return false;
  if (job.driverId && booking.driverId !== job.driverId) return false;
  if (job.assignedAtMs !== undefined) {
    if (!Number.isFinite(assignedAtMs) || assignedAtMs !== job.assignedAtMs) return false;
  }
  return true;
}

export function scheduledRideJobKind(name: string, dataKind?: string): ScheduledRideJobKind | "LEGACY_REMINDER" | "LEGACY_READINESS" | null {
  const value = name || dataKind || "";
  if (value === "T30" || value === "T20" || value === "SCHEDULED_REMINDER_30" || value === "SCHEDULED_WARNING_20") return "LEGACY_REMINDER";
  if (value === "T15" || value === "SCHEDULED_READINESS_CHECK") return "LEGACY_READINESS";
  if (["REMINDER_24H", "REMINDER_5H", "REMINDER_1H", "REMINDER_15M", "REMINDER_ADAPTIVE", "READINESS_15M"].includes(value)) return value as ScheduledRideJobKind;
  return null;
}
