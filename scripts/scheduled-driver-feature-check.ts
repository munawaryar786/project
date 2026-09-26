import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDriverRideIcs, escapeIcsText, isDriverCalendarRideEligible } from "../lib/driver-calendar";
import { createScheduledRideJobPlan, createScheduledRideJobPlanWithRecentMilestones, isCurrentScheduledRideJob, isWithinScheduledReminderReconciliationWindow, processCursorBatches, scheduledReminderDedupeKey, scheduledRideJobId, scheduledRideJobKind, SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS } from "../lib/scheduled-reminders";
import { bookingPickupAt, isFutureScheduledBooking, parseMarketDateTime } from "../lib/scheduled-marketplace";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const origin = Date.UTC(2026, 0, 10, 0, 0, 0);
const plan = (remainingMinutes: number, assignedOffsetMinutes = 0, nowOffsetMinutes = assignedOffsetMinutes) =>
  createScheduledRideJobPlan({ assignedAtMs: origin + assignedOffsetMinutes * MINUTE, pickupAtMs: origin + remainingMinutes * MINUTE, nowMs: origin + nowOffsetMinutes * MINUTE });
const reminders = (items: ReturnType<typeof createScheduledRideJobPlan>) => items.filter((item) => item.kind.startsWith("REMINDER_"));
const reminderOffsets = (items: ReturnType<typeof createScheduledRideJobPlan>) => reminders(items).map((item) => item.minutesBeforePickup).sort((a, b) => b - a);

assert.deepEqual(reminderOffsets(plan(30 * 60)), [1440, 300, 60, 15], "30h assignment gets T-24h, T-5h, T-1h and T-15m");
assert.deepEqual(reminderOffsets(plan(10 * 60)), [300, 60, 15], "10h assignment gets T-5h, T-1h and T-15m");
assert.deepEqual(reminderOffsets(plan(180)), [120, 60, 15], "3h assignment gets adaptive T-2h then T-1h and T-15m");
assert.equal(reminders(plan(180))[0].kind, "REMINDER_ADAPTIVE");
assert.deepEqual(reminderOffsets(plan(120)), [90, 60, 15], "2h assignment gets one midpoint adaptive reminder");
assert.deepEqual(reminderOffsets(plan(70)), [60, 15], "70m assignment skips an unhelpfully close adaptive reminder");
assert.deepEqual(reminderOffsets(plan(40)), [30, 15], "40m assignment gets T-30m and T-15m");
assert.equal(plan(40)[0].runAtMs, origin + 10 * MINUTE);
assert.deepEqual(reminderOffsets(plan(25)), [15], "25m assignment gets T-15m only");
const fifteenTenSeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + 15 * MINUTE + 10_000, nowMs: origin });
assert.equal(fifteenTenSeconds.find((item) => item.kind === "REMINDER_15M")?.runAtMs, origin + 10_000, "T-15m10s acceptance queues the T-15m reminder immediately for its milestone");
assert.equal(isFutureScheduledBooking({ scheduledRide: true, pickupAt: new Date(origin + 15 * MINUTE + 10_000) }, new Date(origin)), true, "near-T15 scheduled offer is eligible for immediate event scheduling");
const fifteenFiveSeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + 15 * MINUTE + 5_000, nowMs: origin });
assert.equal(fifteenFiveSeconds.find((item) => item.kind === "REMINDER_15M")?.runAtMs, origin + 5_000, "T-15m05s acceptance queues the T-15m reminder immediately before the threshold");
const fifteenTwentySeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + 15 * MINUTE + 20_000, nowMs: origin });
assert.equal(fifteenTwentySeconds.find((item) => item.kind === "REMINDER_15M")?.runAtMs, origin + 20_000, "T-15m20s offer acceptance queues the T-15m reminder immediately");
const oneHourTenSeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + HOUR + 10_000, nowMs: origin });
assert.equal(oneHourTenSeconds.find((item) => item.kind === "REMINDER_1H")?.runAtMs, origin + 10_000, "T-1h10s acceptance queues the T-1h reminder immediately instead of waiting for reconciliation");
const fifteenReminderLateBy20s = createScheduledRideJobPlanWithRecentMilestones({ assignedAtMs: origin, pickupAtMs: origin + 15 * MINUTE + 10_000, nowMs: origin + 30_000 });
assert.equal(fifteenReminderLateBy20s.find((item) => item.kind === "REMINDER_15M")?.runAtMs, origin + 10_000, "outbox delivery 20s after T-15 milestone still queues the recent reminder");
assert.equal(fifteenReminderLateBy20s.filter((item) => item.kind === "READINESS_15M").length, 1, "late reminder catch-up keeps readiness as its own job");
assert.equal(createScheduledRideJobPlanWithRecentMilestones({ assignedAtMs: origin, pickupAtMs: origin + 15 * MINUTE + 10_000, nowMs: origin + 30_001 }).some((item) => item.kind === "REMINDER_15M"), false, "milestones older than the 30s delivery grace are not sent stale");
const thirtyFiveSeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + 30 * MINUTE + 5_000, nowMs: origin });
assert.equal(thirtyFiveSeconds.find((item) => item.kind === "REMINDER_ADAPTIVE")?.runAtMs, origin + 5_000, "T-30m05s acceptance queues the adaptive T-30m reminder immediately");
const thirtyTenSeconds = createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + 30 * MINUTE + 10_000, nowMs: origin });
assert.equal(thirtyTenSeconds.find((item) => item.kind === "REMINDER_ADAPTIVE")?.runAtMs, origin + 10_000, "T-30m10s offer acceptance queues the adaptive T-30m reminder immediately");
const thirtyMinuteMilestoneLateByFiveSeconds = createScheduledRideJobPlanWithRecentMilestones({ assignedAtMs: origin, pickupAtMs: origin + 30 * MINUTE + 5_000, nowMs: origin + 10_000 });
assert.equal(thirtyMinuteMilestoneLateByFiveSeconds.find((item) => item.kind === "REMINDER_ADAPTIVE")?.runAtMs, origin + 5_000, "immediate post-accept scheduling catches the adaptive T-30m milestone crossed during request handling");
assert.deepEqual(reminderOffsets(plan(70)), [60, 15], "T-70m keeps T-1h and T-15m without changing the planner");

assert.deepEqual(reminderOffsets(plan(1440)), [300, 60, 15], "at exactly 24h, T-24h is not re-enqueued");
assert.deepEqual(reminderOffsets(plan(300)), [60, 15], "at exactly 5h, T-5h is not re-enqueued");
assert.deepEqual(reminderOffsets(plan(60)), [30, 15], "at exactly 1h, adaptive T-30m and T-15m remain");
assert.deepEqual(reminderOffsets(plan(30)), [15], "at exactly 30m there is no adaptive reminder");
assert.deepEqual(reminderOffsets(plan(15)), [], "at exactly 15m there is no stale reminder");
assert.equal(plan(15).filter((item) => item.kind === "READINESS_15M").length, 1, "readiness remains distinct at T-15m");
assert.deepEqual(plan(10).filter((item) => item.kind.startsWith("REMINDER_")), [], "less than 15m does not manufacture reminders");
assert.deepEqual(plan(10).filter((item) => item.kind === "READINESS_15M").length, 1, "operational readiness remains for a future pickup");
assert.equal(plan(10)[0].runAtMs, plan(10, 0, 2)[0].runAtMs, "readiness keeps a stable target across reconciliation");
assert.equal(plan(20).some((item) => item.kind === "READINESS_15M"), true, "readiness is scheduled normally when T-15 is still in the future");
for (const remainingMinutes of [14, 10, 8, 3]) {
  const freshCatchUp = plan(remainingMinutes).find((item) => item.kind === "READINESS_15M");
  assert.ok(freshCatchUp, `fresh assignment at T-${remainingMinutes} gets immediate readiness catch-up`);
  assert.equal(freshCatchUp.runAtMs, origin + (remainingMinutes - 15) * MINUTE, "catch-up preserves the readiness milestone timestamp");
}
assert.equal(plan(10, 0, 5).filter((item) => item.kind === "READINESS_15M").length, 1, "a just-committed assignment gets bounded readiness catch-up at the five-minute limit");
assert.equal(plan(10, 0, 6).some((item) => item.kind === "READINESS_15M"), false, "reconciliation does not recreate overdue readiness after its fresh-assignment catch-up window");
assert.equal(plan(22, 0, 6).some((item) => item.kind === "READINESS_15M"), true, "a readiness milestone still in the future remains scheduled regardless of assignment age");
assert.deepEqual(plan(14, 0, 14), [], "no readiness job is created after pickup");
assert.deepEqual(createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: origin + HOUR, nowMs: origin + HOUR }), [], "no jobs are planned after pickup");
assert.deepEqual(reminders(plan(120, 0, 60)).map((item) => item.minutesBeforePickup), [15], "reconciliation does not enqueue already-passed milestones");
const reminderHorizon = 24 * HOUR + 5 * MINUTE;
assert.equal(SCHEDULED_REMINDER_RECONCILIATION_HORIZON_MS, reminderHorizon, "reconciliation horizon is T-24h plus a five-minute jitter margin");
const beyondReminderHorizon = new Date(origin + reminderHorizon + 1);
assert.equal(isWithinScheduledReminderReconciliationWindow(beyondReminderHorizon, new Date(origin)), false, "rides beyond the reminder horizon are not scheduled early");
assert.equal(isWithinScheduledReminderReconciliationWindow(beyondReminderHorizon, new Date(origin + MINUTE)), true, "a ride becomes eligible after it enters the rolling reminder horizon");
assert.equal(isWithinScheduledReminderReconciliationWindow(new Date(origin + reminderHorizon), new Date(origin)), true, "pickup at the lookahead boundary is included");
assert.equal(isWithinScheduledReminderReconciliationWindow(new Date(origin), new Date(origin)), false, "past/current pickups are excluded");
assert.equal(isWithinScheduledReminderReconciliationWindow(new Date(origin), new Date(origin)), false, "past/current pickups are excluded");

const simulatedBookings = Array.from({ length: 750 }, (_, index) => ({ id: `booking-${String(index).padStart(3, "0")}` }));
async function verifyCursorPagination() {
  const reconciledIds: string[] = [];
  const fetchPersistedPage = async (cursor: string | null, size: number) => {
    const start = cursor ? simulatedBookings.findIndex((row) => row.id === cursor) + 1 : 0;
    return simulatedBookings.slice(start, start + size);
  };
  const firstPersistedBatch: { cursor: string | null; processed: number; exhausted: boolean } = await processCursorBatches<{ id: string }, string>({
    cursor: null,
    pageSize: 100,
    maxPages: 5,
    fetchPage: fetchPersistedPage,
    getCursor: (row) => row.id,
    process: async (row) => { reconciledIds.push(row.id); return true; },
  });
  assert.equal(firstPersistedBatch.processed, 500);
  assert.equal(firstPersistedBatch.exhausted, false, "reconciliation stops after five bounded pages and keeps its cursor");
  const secondPersistedBatch = await processCursorBatches({
    cursor: firstPersistedBatch.cursor,
    pageSize: 100,
    maxPages: 5,
    fetchPage: fetchPersistedPage,
    getCursor: (row: { id: string }) => row.id,
    process: async (row: { id: string }) => { reconciledIds.push(row.id); return true; },
  });
  assert.equal(secondPersistedBatch.processed, 250);
  assert.equal(secondPersistedBatch.exhausted, true, "later reconciliation continues after the first 500 instead of starving the remaining rides");
  assert.equal(reconciledIds.length, 750);
  assert.equal(new Set(reconciledIds).size, 750, "bounded cursor pagination neither duplicates nor skips any of 750 rides");
  assert.deepEqual(reconciledIds, simulatedBookings.map((row) => row.id), "cursor pagination is deterministic through later pages");

  const dedupedQueueIds = new Set<string>();
  for (let sweep = 0; sweep < 2; sweep++) {
    let cursor: string | null = null;
    let exhausted = false;
    for (let batchNumber = 0; batchNumber < 3 && !exhausted; batchNumber++) {
      const result: { cursor: string | null; processed: number; exhausted: boolean } = await processCursorBatches({
        cursor, pageSize: 100, maxPages: 5, fetchPage: fetchPersistedPage,
        getCursor: (row: { id: string }) => row.id,
        process: async (row: { id: string }) => {
          dedupedQueueIds.add(scheduledRideJobId({ bookingId: row.id, pickupAtMs: origin + 3 * HOUR, driverId: "driver-a", assignedAtMs: origin, kind: "REMINDER_1H", runAtMs: origin + 2 * HOUR }));
          return true;
        },
      });
      cursor = result.cursor;
      exhausted = result.exhausted;
    }
    assert.equal(exhausted, true, "each reconciliation sweep finishes via bounded cursor batches");
  }
  assert.equal(dedupedQueueIds.size, 750, "repeated reconciliation produces no new deterministic queue identities");

  const legacyRows = simulatedBookings.map((row) => ({ ...row, pickupAt: null as Date | null, pickupDate: "2026-01-10", pickupTime: "02:00", marketTimezone: "Europe/Bratislava" }));
  const reconstructedIds: string[] = [];
  const fetchLegacyPage = async (cursor: string | null, size: number) => {
    const start = cursor ? legacyRows.findIndex((row) => row.id === cursor) + 1 : 0;
    return legacyRows.slice(start, start + size);
  };
  const firstLegacyBatch = await processCursorBatches<typeof legacyRows[number], string>({
    cursor: null,
    pageSize: 100,
    maxPages: 5,
    fetchPage: fetchLegacyPage,
    getCursor: (row) => row.id,
    process: async (row) => {
      if (!isWithinScheduledReminderReconciliationWindow(bookingPickupAt(row), new Date(origin))) return false;
      reconstructedIds.push(row.id);
      return true;
    },
  });
  const secondLegacyBatch = await processCursorBatches({
    cursor: firstLegacyBatch.cursor, pageSize: 100, maxPages: 5, fetchPage: fetchLegacyPage,
    getCursor: (row: { id: string }) => row.id,
    process: async (row: typeof legacyRows[number]) => {
      if (!isWithinScheduledReminderReconciliationWindow(bookingPickupAt(row), new Date(origin))) return false;
      reconstructedIds.push(row.id);
      return true;
    },
  });
  assert.equal(firstLegacyBatch.processed + secondLegacyBatch.processed, 750);
  assert.equal(secondLegacyBatch.exhausted, true, "pickupAt-null reconstruction continues across bounded executions");
  assert.equal(new Set(reconstructedIds).size, 750, "legacy reconstruction pagination processes each row once");
  assert.deepEqual(reconstructedIds, simulatedBookings.map((row) => row.id), "legacy id cursor reaches rows beyond the first 100");

  const failedOnce = new Set<string>();
  const recoveredIds: string[] = [];
  const retryInput = {
    pageSize: 100,
    maxPages: 5,
    fetchPage: async (cursor: string | null, size: number) => {
      const start = cursor ? simulatedBookings.findIndex((row) => row.id === cursor) + 1 : 0;
      return simulatedBookings.slice(start, Math.min(start + size, 250));
    },
    getCursor: (row: { id: string }) => row.id,
    process: async (row: { id: string }) => {
      if (row.id === "booking-000" && !failedOnce.has(row.id)) { failedOnce.add(row.id); return false; }
      recoveredIds.push(row.id);
      return true;
    },
  };
  const failedBatch = await processCursorBatches({ ...retryInput, cursor: null });
  assert.equal(failedBatch.cursor, null, "failed queue scheduling leaves the cursor before the failed row");
  assert.equal(failedBatch.processed, 0);
  const recoveredBatch = await processCursorBatches({ ...retryInput, cursor: failedBatch.cursor });
  assert.equal(recoveredBatch.processed, 250, "the next reconciliation retries the failed row and progresses the full batch");
  assert.equal(recoveredIds.length, 250);
  assert.equal(new Set(recoveredIds).size, 250, "queue-failure recovery does not duplicate later rows");
}
void verifyCursorPagination().then(() => console.log("Scheduled Driver reminder/calendar checks passed.")).catch((error) => { console.error(error); process.exitCode = 1; });

const allPlans = [plan(30 * 60), plan(10 * 60), plan(180), plan(120), plan(70), plan(40), plan(25)];
for (const scheduled of allPlans) {
  const reminderTimes = reminders(scheduled).map((item) => item.runAtMs);
  assert.equal(new Set(reminderTimes).size, reminderTimes.length, "reminder milestones do not duplicate");
  assert.equal(scheduled.some((item) => ["REMINDER_30M", "REMINDER_20M"].includes(String(item.kind))), false, "old 30/20-minute reminders are not scheduled");
}
assert.equal(scheduledRideJobKind("T30"), "LEGACY_REMINDER");
assert.equal(scheduledRideJobKind("T20"), "LEGACY_REMINDER");
assert.equal(scheduledRideJobKind("SCHEDULED_REMINDER_30"), "LEGACY_REMINDER");
assert.equal(scheduledRideJobKind("SCHEDULED_WARNING_20"), "LEGACY_REMINDER");
assert.equal(scheduledRideJobKind("T15"), "LEGACY_READINESS");
assert.equal(scheduledRideJobKind("READINESS_15M"), "READINESS_15M");

const pickupAt = new Date(origin + 180 * MINUTE);
const assignment = new Date(origin);
const job = { bookingId: "booking-a", pickupAtMs: pickupAt.getTime(), driverId: "driver-a", assignedAtMs: assignment.getTime() };
const assignedBooking = { id: "booking-a", driverId: "driver-a", acceptedAt: assignment, createdAt: assignment, status: "CONFIRMED", scheduledRide: true, pickupAt };
assert.equal(isCurrentScheduledRideJob({ booking: assignedBooking, job, nowMs: origin + 100 * MINUTE }), true);
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, status: "CANCELLED" }, job, nowMs: origin }), false, "cancelled ride is a no-op");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, status: "COMPLETED" }, job, nowMs: origin }), false, "completed ride is a no-op");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, status: "NO_SHOW" }, job, nowMs: origin }), false, "no-show ride is a no-op");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, driverId: null }, job, nowMs: origin }), false, "unassigned ride is a no-op");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, pickupAt: new Date(pickupAt.getTime() + MINUTE) }, job, nowMs: origin }), false, "changed pickup time is stale");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, driverId: "driver-b", acceptedAt: new Date(origin + MINUTE) }, job, nowMs: origin }), false, "released Driver A cannot receive the old job");
const reassignedBooking = { ...assignedBooking, driverId: "driver-b", acceptedAt: new Date(origin + MINUTE) };
const reassignedJob = { ...job, driverId: "driver-b", assignedAtMs: origin + MINUTE };
assert.equal(isCurrentScheduledRideJob({ booking: reassignedBooking, job: reassignedJob, nowMs: origin + MINUTE }), true, "Driver B gets an independent current assignment generation");
const ordinaryRide = { scheduledRide: false, pickupAt: new Date(origin + 40 * MINUTE) };
assert.equal(ordinaryRide.scheduledRide === true && isFutureScheduledBooking(ordinaryRide, new Date(origin)), false, "ordinary non-scheduled accepted ride does not enter scheduled reminder scheduling");
assert.equal(scheduledReminderDedupeKey({ bookingId: job.bookingId, pickupAtMs: job.pickupAtMs, driverId: "driver-a", assignedAtMs: job.assignedAtMs, kind: "REMINDER_1H" }), scheduledReminderDedupeKey({ bookingId: job.bookingId, pickupAtMs: job.pickupAtMs, driverId: "driver-a", assignedAtMs: job.assignedAtMs, kind: "REMINDER_1H" }), "same reminder key is deterministic");
assert.notEqual(scheduledReminderDedupeKey({ bookingId: job.bookingId, pickupAtMs: job.pickupAtMs, driverId: "driver-a", assignedAtMs: job.assignedAtMs, kind: "REMINDER_1H" }), scheduledReminderDedupeKey({ bookingId: job.bookingId, pickupAtMs: job.pickupAtMs, driverId: "driver-b", assignedAtMs: origin + MINUTE, kind: "REMINDER_1H" }), "replacement Driver receives an independent dedupe identity");
const deterministicJob = { bookingId: job.bookingId, pickupAtMs: job.pickupAtMs, driverId: job.driverId, assignedAtMs: job.assignedAtMs, kind: "REMINDER_15M" as const, runAtMs: origin + 165 * MINUTE };
assert.equal(scheduledRideJobId(deterministicJob), scheduledRideJobId({ ...deterministicJob }), "immediate scheduling and reconciliation use the same BullMQ job identity");
const immediateJobIds = plan(40).map((item) => scheduledRideJobId({ bookingId: job.bookingId, pickupAtMs: origin + 40 * MINUTE, driverId: job.driverId, assignedAtMs: origin, kind: item.kind, runAtMs: item.runAtMs })).sort();
const reconciledJobIds = plan(40, 0, 5).map((item) => scheduledRideJobId({ bookingId: job.bookingId, pickupAtMs: origin + 40 * MINUTE, driverId: job.driverId, assignedAtMs: origin, kind: item.kind, runAtMs: item.runAtMs })).sort();
assert.deepEqual(reconciledJobIds, immediateJobIds, "later reconciliation cannot add duplicate jobs for the same assignment");

assert.equal(parseMarketDateTime("2026-01-15", "12:00", "Europe/Bratislava")?.toISOString(), "2026-01-15T11:00:00.000Z", "winter Bratislava time converts to UTC");
assert.equal(parseMarketDateTime("2026-07-15", "12:00", "Europe/Bratislava")?.toISOString(), "2026-07-15T10:00:00.000Z", "summer Bratislava time converts to UTC");

const ride = { id: "65a1b2c3d4e5f67890123456", bookingRef: "DR-1234", driverId: "driver-a", scheduledRide: true, status: "CONFIRMED", pickupAt, pickupAddress: "Main St, 4; \"B\\C\"\nUnit", dropoffAddress: "Destination; 8", serviceType: "STANDARD" };
assert.equal(isDriverCalendarRideEligible(ride, "driver-a", new Date(origin)), true, "assigned Driver can export own future scheduled ride");
assert.equal(isDriverCalendarRideEligible(ride, "driver-b", new Date(origin)), false, "another Driver cannot export the ride");
assert.equal(isDriverCalendarRideEligible({ ...ride, scheduledRide: false }, "driver-a", new Date(origin)), false, "non-scheduled ride is rejected");
assert.equal(isDriverCalendarRideEligible({ ...ride, pickupAt: new Date(origin) }, "driver-a", new Date(origin)), false, "past pickup is rejected");
assert.equal(isDriverCalendarRideEligible({ ...ride, status: "CANCELLED" }, "driver-a", new Date(origin)), false, "cancelled calendar ride is rejected");
assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne", "iCalendar text escaping covers separators, slash and newline");
const ics = createDriverRideIcs(ride, new Date(origin));
const unfoldedIcs = ics.replace(/\r\n[ \t]/g, "");
assert.match(ics, /BEGIN:VCALENDAR\r\nVERSION:2\.0/);
assert.match(ics, /UID:65a1b2c3d4e5f67890123456@drivo\r\n/);
assert.match(ics, /DTSTART:20260110T030000Z\r\n/);
assert.match(ics, /Booking reference: DR-1234/);
assert.ok(unfoldedIcs.includes('LOCATION:Main St\\, 4\\; "B\\\\C"\\nUnit'));
assert.ok(unfoldedIcs.includes('Pickup: Main St\\, 4\\; "B\\\\C"\\nUnit'));
assert.match(ics, /Destination: Destination\\; 8/);
assert.match(ics, /Service: STANDARD/);
assert.doesNotMatch(ics, /DTEND|DURATION|Passenger Name|passenger@example|medical|wheelchair|private note/i);
assert.equal(ics.endsWith("\r\n"), true);
assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false, "ICS uses CRLF line endings");
assert.equal(ics.includes("DTEND:"), false, "no arbitrary ride end time is invented");

const route = readFileSync("app/api/driver/scheduled-rides/[id]/calendar/route.ts", "utf8");
const dashboard = readFileSync("app/driver/dashboard/page.tsx", "utf8");
const driverBookingsRoute = readFileSync("app/api/driver/bookings/route.ts", "utf8");
assert.ok(route.indexOf("authorizeDriver(request)") < route.indexOf("prisma.booking.findFirst"), "calendar endpoint authenticates before booking access");
assert.match(route, /driverId:\s*auth\.actor\.id/);
assert.match(route, /scheduledRide:\s*true/);
assert.match(route, /text\/calendar; charset=utf-8/);
assert.match(route, /Content-Disposition/);
assert.match(route, /Cache-Control.*no-store/);
assert.match(route, /bookingPickupAt\(booking\)/);
assert.match(dashboard, /driverPortal\.addToCalendar/);
assert.match(dashboard, /min-h-11/);
assert.match(dashboard, /focus-visible:outline/);
assert.match(dashboard, /!\["CANCELLED", "COMPLETED", "NO_SHOW"\]\.includes\(booking\.status\)/, "calendar action is hidden for terminal rides");
assert.match(dashboard, /role=\{calendarMessage === "error" \? "alert" : "status"\}/);
assert.match(driverBookingsRoute, /booking\.scheduledRide \? \{ \.\.\.booking, pickupAt: bookingPickupAt\(booking\) \} : booking/, "assigned Driver data reconstructs legacy scheduled pickup instants for the optional calendar action");

const notificationHelper = readFileSync("lib/notifications.ts", "utf8");
const marketplace = readFileSync("lib/scheduled-marketplace.ts", "utf8");
const worker = readFileSync("workers/realtime-worker.ts", "utf8");
const jobsSource = readFileSync("lib/scheduled-jobs.ts", "utf8");
const acceptRoute = readFileSync("app/api/driver/ride-requests/respond/route.ts", "utf8");
const workerSource = readFileSync("workers/realtime-worker.ts", "utf8");
const acceptanceService = readFileSync("lib/driver-operations.ts", "utf8");
const automaticDispatch = readFileSync("lib/automatic-dispatch.ts", "utf8");
const adminOperations = readFileSync("lib/admin-operations.ts", "utf8");
const adminAssignRoute = readFileSync("app/api/admin/operations/assign/route.ts", "utf8");
const scheduledJobsSource = readFileSync("lib/scheduled-jobs.ts", "utf8");
assert.match(notificationHelper, /prisma\.notification\.upsert/);
assert.match(marketplace, /scheduledReminderDedupeKey[\s\S]*dedupeKey: key/);
assert.match(marketplace, /idempotencyKey: key/);
assert.match(jobsSource, /LEGACY_REMINDER[\s\S]*LEGACY_REMINDER_IGNORED/);
assert.match(jobsSource, /pickupAt:\s*null/);
assert.match(worker, /SCHEDULED_REMINDER_30[\s\S]*SCHEDULED_WARNING_20[\s\S]*return/);
assert.ok(acceptRoute.indexOf("acceptDriverOfferAtomically") < acceptRoute.indexOf("scheduleScheduledRideJobs(result.bookingId)"), "immediate reminder scheduling happens after the atomic accept call returns");
assert.ok(acceptRoute.indexOf("if (!result.ok)") < acceptRoute.indexOf("scheduleScheduledRideJobs(result.bookingId)"), "failed/rejected offers return before any reminder scheduling");
assert.ok(acceptRoute.indexOf('if (action !== "ACCEPT")') < acceptRoute.indexOf("scheduleScheduledRideJobs(result.bookingId)"), "declines return before any reminder scheduling");
assert.match(acceptRoute, /action: z\.enum\(\["ACCEPT", "DECLINE", "REJECT"\]\)/, "decline and reject share the non-accept path without scheduling accepted reminders");
assert.ok(acceptRoute.indexOf("if (result.bookingId)") < acceptRoute.indexOf("scheduleScheduledRideJobs(result.bookingId)"), "successful accept schedules only when it returned a booking id");
assert.match(acceptRoute, /sole production caller of acceptDriverOfferAtomically[\s\S]*try \{ await scheduleScheduledRideJobs\(result\.bookingId\); \}[\s\S]*catch \{ console\.error\("\[driver\.scheduled-reminders\.schedule-failed\]", \{ code: "SCHEDULED_REMINDER_ENQUEUE_FAILED" \}\); \}/, "sole production acceptance caller schedules after commit and logs a structured safe failure");
assert.ok(acceptRoute.indexOf("driver.scheduled-reminders.schedule-failed") < acceptRoute.indexOf('action: "ACCEPTED"'), "successful acceptance response is preserved after scheduling failure");
assert.ok(acceptRoute.indexOf("scheduleScheduledRideJobs(result.bookingId)") < acceptRoute.indexOf('action: "ACCEPTED"'), "reminder scheduling is attempted before returning ACCEPTED");
assert.match(acceptanceService, /export async function acceptDriverOfferAtomically[\s\S]*prisma\.\$transaction/);
assert.match(acceptanceService, /eventType: "DRIVER_OFFER_ACCEPTED"/);
assert.doesNotMatch(acceptanceService, /scheduleScheduledRideJobs/);
assert.match(acceptanceService, /data: \{ driverId: input\.driverId, status: "ASSIGNED", dispatchStatus: "ACCEPTED", acceptedAt: now \}/, "accepted replacement Driver receives a fresh assignment timestamp");
assert.match(automaticDispatch, /export async function startScheduledRecoveryDispatch[\s\S]*runCycle\(tx, bookingId, configResult\.config, false, true\)/, "scheduled recovery creates offers through the shared Driver acceptance flow");
assert.match(automaticDispatch, /createDriverOfferInTransaction\(tx, \{[\s\S]*bookingId, driverId: selected\.driver\.id/, "recovery dispatch creates a RideRequest accepted by the immediate-scheduling endpoint");
assert.match(marketplace, /eventType: "SCHEDULED_RIDE_CLAIMED"/);
const claimPath = marketplace.slice(marketplace.indexOf("export async function claimScheduledRide"), marketplace.indexOf("export async function releaseScheduledAssignment"));
assert.ok(claimPath.indexOf("await prisma.$transaction") < claimPath.indexOf("await scheduleScheduledRideJobs(bookingId)"), "marketplace claim schedules reminders only after its transaction commits");
assert.match(claimPath, /if \(result\.ok && !result\.alreadyClaimed\)[\s\S]*try \{ await scheduleScheduledRideJobs\(bookingId\); \}[\s\S]*catch \{ console\.error\("\[scheduled\.marketplace\.reminders\.schedule-failed\]"\); \}/, "successful new marketplace claims schedule immediately without turning queue failure into claim failure");
assert.match(adminOperations, /eventType: "ADMIN_MANUAL_ASSIGNMENT"/);
assert.ok(adminAssignRoute.indexOf("await assignAdminDriver(") < adminAssignRoute.indexOf("scheduleScheduledRideJobs(parsed.data.bookingId)"), "Admin assignment reminders are scheduled after the assignment transaction returns");
assert.ok(adminAssignRoute.indexOf("if (!result.ok)") < adminAssignRoute.indexOf("scheduleScheduledRideJobs(parsed.data.bookingId)"), "failed Admin assignments do not schedule reminders");
assert.match(adminAssignRoute, /try \{ await scheduleScheduledRideJobs\(parsed\.data\.bookingId\); \}[\s\S]*catch \{ console\.error\("\[admin\.scheduled-reminders\.schedule-failed\]"\); \}/, "Admin queue failure is logged safely without changing committed assignment success");
assert.match(marketplace, /if \(!booking\?\.driverId \|\| !isScheduledBooking\(booking, new Date\(booking\.acceptedAt \|\| booking\.createdAt\)\)/, "legacy scheduling uses stable assignment-time classification");
assert.match(marketplace, /const assignedAtMs = new Date\(booking\.acceptedAt \|\| booking\.createdAt\)\.getTime\(\)/, "fresh acceptedAt controls reminder milestone planning after assignment");
assert.match(marketplace, /const jobId = scheduledRideJobId\(\{ bookingId, pickupAtMs: pickupMs, driverId: booking\.driverId, assignedAtMs, kind: job\.kind, runAtMs: job\.runAtMs \}\)/, "replacement Drivers and assignment generations receive distinct deterministic job IDs");
assert.match(marketplace, /job\.kind === "READINESS_15M" \? \{ age: 24 \* 60 \* 60 \} : \{ count: 1000 \}/, "completed readiness job identity is retained beyond pickup so reconciliation cannot recreate it");
assert.match(marketplace, /scheduledRideJobId\(/);
assert.match(workerSource, /setInterval\([\s\S]*reconcileExpired\(\)[\s\S]*30000\)/);
assert.match(workerSource, /reconcileScheduledRideJobs\(\)/, "30-second reconciliation remains the recovery fallback");
const acceptedEventBranch = workerSource.slice(workerSource.indexOf('if (event.eventType === "DRIVER_OFFER_ACCEPTED")'), workerSource.indexOf('if (event.eventType === "DISPATCH_EXHAUSTED")'));
assert.ok(workerSource.indexOf("const booking = await prisma.booking.findUnique") < workerSource.indexOf('if (event.eventType === "DRIVER_OFFER_ACCEPTED")'), "outbox scheduling re-reads committed booking ownership before notifying/scheduling");
assert.match(acceptedEventBranch, /booking\?\.scheduledRide === true && isFutureScheduledBooking\(booking\)[\s\S]*scheduleScheduledRideJobs\(bookingId\)/, "committed DRIVER_OFFER_ACCEPTED event schedules eligible future rides immediately");
assert.match(workerSource, /isScheduledReminderDeliveryCurrent\(booking, p\)/, "outbox delivery uses the shared ownership/assignment/pickup guard, exercised by runtime tests");
assert.match(workerSource, /\["SCHEDULED_RIDE_CLAIMED", "ADMIN_MANUAL_ASSIGNMENT"\][\s\S]*scheduleScheduledRideJobs\(bookingId\)/, "claim and Admin assignment outbox events schedule promptly");
assert.match(adminOperations, /await tx\.booking\.updateMany[\s\S]*acceptedAt: new Date\(\)[\s\S]*eventType: "ADMIN_MANUAL_ASSIGNMENT"/, "Admin assignment commits a fresh timestamp and durable scheduling outbox event together");
assert.match(workerSource, /catch \(error\) \{ await prisma\.outboxEvent\.updateMany\([\s\S]*state: OUTBOX_STATES\.RETRY[\s\S]*processing_failed[\s\S]*throw error/);
assert.match(scheduledJobsSource, /pickupAt: \{ gt: now, lte: horizon \}/, "persisted pickup reconciliation uses a bounded horizon");
assert.match(scheduledJobsSource, /orderBy: \[\{ pickupAt: "asc" \}, \{ id: "asc" \}\][\s\S]*take,/, "persisted rows use deterministic keyset pagination and a bounded take");
assert.match(scheduledJobsSource, /pickupAt: null[\s\S]*\{ id: \{ gt: cursor \} \}[\s\S]*orderBy: \[\{ id: "asc" \}\][\s\S]*take,/, "pickupAt-null rows use bounded deterministic id pagination");
assert.match(scheduledJobsSource, /RECONCILIATION_MAX_PAGES_PER_RUN = 5/);
assert.match(scheduledJobsSource, /processCursorBatches/);
assert.match(scheduledJobsSource, /isWithinScheduledReminderReconciliationWindow\(pickupAt, now\)/, "reconstructed legacy pickups are range-filtered before scheduling");
assert.match(scheduledJobsSource, /orderBy: \[\{ pickupAt: "asc" \}, \{ id: "asc" \}\]/);
assert.ok(ics.split("\r\n").filter(Boolean).every((line) => new TextEncoder().encode(line).length <= 75), "ICS lines are folded within 75 UTF-8 octets");

const newLocaleKeys = ["addToCalendar", "addToCalendarForRide", "preparingCalendar", "calendarDownloadSuccess", "calendarDownloadError", "scheduledRideReminderMessage"];
for (const locale of ["en", "sk", "de", "uk"]) {
  const source = readFileSync(`lib/i18n/translations/${locale}.ts`, "utf8");
  for (const key of newLocaleKeys) assert.ok(source.includes(`\"driverPortal.${key}\"`), `${locale} contains driverPortal.${key}`);
}
assert.deepEqual(createScheduledRideJobPlan({ assignedAtMs: origin + 1, pickupAtMs: origin + HOUR, nowMs: origin }), [], "future assignment timestamps fail closed");
assert.deepEqual(createScheduledRideJobPlanWithRecentMilestones({ assignedAtMs: origin, pickupAtMs: origin + 5_000, nowMs: origin + 10_000 }), [], "recent-milestone recovery never produces jobs after pickup");
assert.equal(isCurrentScheduledRideJob({ booking: { ...assignedBooking, scheduledRide: false }, job, nowMs: pickupAt.getTime() - MINUTE }), true, "legacy scheduled classification stays valid in the final five minutes");
const unicodeIcs = createDriverRideIcs({ ...ride, pickupAddress: "Žilina für Україна ".repeat(20), customerName: "PRIVATE_NAME", customerPhone: "PRIVATE_PHONE", customerEmail: "PRIVATE_EMAIL", medicalAppointment: "PRIVATE_MEDICAL", specialNotes: "PRIVATE_NOTES", paymentMethod: "PRIVATE_PAYMENT" } as typeof ride);
assert.ok(unicodeIcs.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
assert.ok(unicodeIcs.replace(/\r\n /g, "").includes("Žilina für Україна ".repeat(20)));
assert.doesNotMatch(unicodeIcs, /PRIVATE_/);
for (const [date, time, utc] of [
  ["2026-03-29", "01:30", "2026-03-29T00:30:00.000Z"],
  ["2026-03-29", "03:30", "2026-03-29T01:30:00.000Z"],
  ["2026-10-25", "01:30", "2026-10-24T23:30:00.000Z"],
  ["2026-10-25", "03:30", "2026-10-25T02:30:00.000Z"],
]) assert.equal(parseMarketDateTime(date, time, "Europe/Bratislava")?.toISOString(), utc, "DST transition uses absolute pickup instant");
assert.deepEqual(createScheduledRideJobPlan({ assignedAtMs: origin, pickupAtMs: 1e20, nowMs: origin }), [], "invalid JavaScript date range rejected");
