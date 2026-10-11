// Run real routes, planner, scheduler and processor with isolated database/queue
// adapters. No environment files, live credentials, Redis or database connections.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextRequest } = require("next/server");
const RealDate = Date;
let now = Date.UTC(2026, 0, 10, 8);
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
global.fetch = async () => { throw new Error("Unexpected network access"); };
const driverId = "111111111111111111111111", otherDriver = "222222222222222222222222", bookingId = "333333333333333333333333";
const admin = { id: "555555555555555555555555", role: "SUPER_ADMIN", authVersion: 0 };
let adminAudits = [];
const minute = 60_000;
let rows = [], notifications = [], outbox = [], offers = [], actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false };
let transactionOpen = false, queueFailure = false, failOutbox = false, raceOnWrite = false, acceptOK = true, recoveryCount = 0, queueAttempts = 0, recoveryFailure = false;
let outboxCreateAttempts = 0, retryFailure = false, retryRace = false;
const queued = new Map(), pageSizes = [];
const processors = new Map(), signals = [], intervals = [];
function match(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => match(row, item));
    if (key === "OR") return value.some((item) => match(row, item));
    if (key === "NOT") return !match(row, value);
    const actual = row[key];
    if (value instanceof RealDate) return actual instanceof RealDate && +actual === +value;
    if (value && typeof value === "object") return Object.entries(value).every(([op, expected]) => {
      if (op === "in") return expected.includes(actual);
      if (op === "notIn") return !expected.includes(actual);
      if (op === "not") return actual !== expected && actual !== undefined;
      if (op === "isSet") return (actual !== undefined) === expected;
      if (op === "gt") return actual > expected;
      if (op === "gte") return actual >= expected;
      if (op === "lte") return actual <= expected;
      throw new Error(`Unsupported test query operator ${op}`);
    });
    return actual === value;
  });
}
const copy = (value) => value && structuredClone(value);
const prisma = {
  booking: {
    findUnique: async ({ where }) => copy(rows.find((row) => match(row, where)) || null),
    findFirst: async ({ where }) => copy(rows.find((row) => match(row, where)) || null),
    findMany: async ({ where, orderBy = [], take }) => {
      if (take) { pageSizes.push(take); assert.ok(take <= 100, "every reconciliation read is bounded"); }
      let found = rows.filter((row) => match(row, where));
      for (const sort of [...(Array.isArray(orderBy) ? orderBy : [orderBy])].reverse()) {
        const [key, direction] = Object.entries(sort)[0];
        found.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === "asc" ? 1 : -1));
      }
      return copy(take ? found.slice(0, take) : found);
    },
    updateMany: async ({ where, data }) => {
      if (raceOnWrite) { raceOnWrite = false; rows[0].driverId = otherDriver; rows[0].acceptedAt = new Date(now); throw Object.assign(new Error("write conflict"), { code: "P2034" }); }
      const matches = rows.filter((row) => match(row, where));
      matches.forEach((row) => Object.assign(row, data));
      return { count: matches.length };
    },
    update: async ({ where, data }) => {
      const row = rows.find((item) => match(item, where));
      assert.ok(row, "test booking update requires an existing booking");
      Object.assign(row, data); return copy(row);
    },
  },
  driver: {
    findUnique: async () => actor,
    update: async ({ where, data }) => {
      assert.ok(match(actor, where)); Object.assign(actor, data); return copy(actor);
    },
    updateMany: async ({ where, data }) => {
      if (!match(actor, where)) return { count: 0 };
      Object.assign(actor, data); return { count: 1 };
    },
  },
  rideRequest: {
    findUnique: async ({ where }) => copy(offers.find((offer) => match(offer, where)) || null),
    findMany: async ({ where }) => copy(offers.filter((offer) => match(offer, where))),
    updateMany: async ({ where, data }) => {
      const found = offers.filter((offer) => match(offer, where));
      found.forEach((offer) => Object.assign(offer, data)); return { count: found.length };
    },
  },
  adminUser: { findMany: async () => [], findUnique: async ({ where }) => match(admin, where) ? copy(admin) : null },
  adminAuditEvent: {
    findUnique: async ({ where }) => copy(adminAudits.find((audit) => match(audit, where)) || null),
    create: async ({ data }) => { const audit = { id: `audit-${adminAudits.length}`, ...data }; adminAudits.push(audit); return copy(audit); },
  },
  notification: { upsert: async ({ where, create }) => { const prior = notifications.find((row) => row.dedupeKey === where.dedupeKey); if (prior) return prior; notifications.push(create); return create; } },
  outboxEvent: {
    findUnique: async ({ where }) => outbox.find((row) => match(row, where)) || null,
    create: async ({ data }) => {
      outboxCreateAttempts++;
      if (failOutbox) throw new Error("injected persistence failure");
      if (outbox.some((row) => row.idempotencyKey === data.idempotencyKey)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      const row = { id: (outbox.length + 1).toString(16).padStart(24, "0"), ...data }; outbox.push(row); return row;
    },
    updateMany: async ({ where, data }) => { const found = outbox.filter((row) => match(row, where)); found.forEach((row) => Object.assign(row, data)); return { count: found.length }; },
  },
  $transaction: async (fn) => {
    const beforeNotifications = copy(notifications), beforeOutbox = copy(outbox);
    transactionOpen = true;
    try { return await fn(prisma); }
    catch (error) { notifications = beforeNotifications; outbox = beforeOutbox; throw error; }
    finally { transactionOpen = false; }
  },
};
function queuedJob(jobId) {
  if (!queued.has(jobId)) return undefined;
  return {
    getState: async () => queued.get(jobId).state || "delayed",
    retry: async (state, options) => {
      assert.equal(transactionOpen, false, "failed job repair is outside the assignment transaction");
      assert.equal(state, "failed"); assert.equal(options.resetAttemptsMade, true);
      const retained = queued.get(jobId);
      if (retryFailure) throw new Error("injected retry failure");
      if (retryRace) { retryRace = false; retained.state = "waiting"; throw new Error("another worker already retried"); }
      assert.equal(retained.state, "failed", "only retained failed jobs may be retried");
      retained.state = "waiting";
      retained.repairs = (retained.repairs || 0) + 1;
    },
  };
}
const queue = { waitUntilReady: () => Promise.resolve(), getJob: async (jobId) => queuedJob(jobId), add: async (kind, data, options) => {
  assert.equal(transactionOpen, false, "Redis is never called in the assignment transaction");
  queueAttempts++;
  if (queueFailure) throw new Error("injected queue failure");
  if (!queued.has(options.jobId)) queued.set(options.jobId, { name: kind, data, options });
  return queuedJob(options.jobId);
} };
const mocks = {
  "@/lib/prisma": { prisma },
  "@/lib/realtime/queues": { getScheduledRideQueue: () => queue, getOutboxQueue: () => queue },
  "bullmq": { Worker: class { constructor(name, handler) { processors.set(name, handler); } on() {} } },
  "@socket.io/redis-emitter": { Emitter: class { of() { return this; } to(room) { this.room = room; return this; } emit(type, payload) { signals.push({ room: this.room, type, payload }); } } },
  "@/lib/realtime/redis": { createRedisConnection: () => ({}) },
  "@/lib/outbox-relay": { relayOutboxOnce: async () => ({ queued: 0 }) },
  "@/lib/email": { bookingToEmailData: () => ({}), sendNoDriverAdminEscalation: async () => {} },
  "@/lib/security/session": {
    sessionCookieName: (type) => type === "ADMIN" ? "admin-session" : "driver-session", csrfCookieName: () => "csrf", hashCsrfToken: () => "hash",
    verifyCanonicalToken: async (token, type) => type === "ADMIN"
      ? token === "admin-valid" ? { sub: admin.id, ver: 0, csrf: "hash" } : null
      : token === "valid" ? { sub: actor.id, ver: 0, csrf: "hash" } : null,
  },
  "@/lib/env": { isAllowedOrigin: () => true },
  "@/lib/navigation/routes": { validCoordinate: (n) => Number.isFinite(n), computeGoogleRoute: async () => ({ durationSeconds: 60 }) },
  "@/lib/automatic-dispatch": { advanceDispatch: async () => ({ ok: true, outcome: "UNCHANGED" }), startScheduledRecoveryDispatch: async () => { if (recoveryFailure) throw new Error("injected recovery failure"); recoveryCount++; return { ok: true }; } },
  "@/lib/driver-operations": {
    acceptDriverOfferAtomically: async () => {
      if (!acceptOK) return { ok: false, code: "OFFER_NOT_FOUND" };
      await prisma.$transaction(async () => { Object.assign(rows[0], { driverId, acceptedAt: new Date(now), status: "ASSIGNED" }); });
      return { ok: true, bookingId: rows[0].id };
    },
    declineDriverOffer: async () => ({ ok: true, bookingId }),
  },
};
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const mod = new Module(full, module); mod.filename = full; mod.paths = Module._nodeModulePaths(path.dirname(full)); cache.set(full, mod);
  mod.require = (name) => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(full), name) + ".ts");
    return Module.prototype.require.call(mod, name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, full);
  return mod.exports;
}
const market = load("lib/scheduled-marketplace.ts"), jobs = load("lib/scheduled-jobs.ts");
const delivery = load("lib/scheduled-reminder-delivery.ts"), acceptRoute = load("app/api/driver/ride-requests/respond/route.ts");
const calendarRoute = load("app/api/driver/scheduled-rides/[id]/calendar/route.ts");
const originalSetInterval = global.setInterval;
global.setInterval = (_callback, delay) => { intervals.push(delay); return { unref() {} }; };
try { load("workers/realtime-worker.ts"); } finally { global.setInterval = originalSetInterval; }
const outboxProcessor = processors.get(load("lib/realtime/constants.ts").REALTIME_QUEUES.OUTBOX);
function ride(remaining = 40) {
  return { id: bookingId, bookingRef: "DR-TEST", driverId, acceptedAt: new Date(now), createdAt: new Date(now - 86400000), status: "ASSIGNED", scheduledRide: true, pickupAt: new Date(now + remaining * minute), pickupDate: null, pickupTime: null, scheduledDate: "2026-01-10", scheduledTime: "10:00", marketTimezone: "Europe/Bratislava", pickupAddress: "Žilina, 4; A\\B\nUnit", dropoffAddress: "Україна für destination", serviceType: "STANDARD", customerName: "PRIVATE_NAME", customerPhone: "PRIVATE_PHONE", customerEmail: "PRIVATE_EMAIL", specialNotes: "PRIVATE_NOTES", medicalAppointment: "PRIVATE_MEDICAL", paymentMethod: "PRIVATE_PAYMENT" };
}
const request = (url, method = "GET", body, authenticated = true) => new NextRequest(`https://test.invalid${url}`, {
  method, headers: { ...(authenticated ? { cookie: "driver-session=valid; csrf=token" } : {}), "x-drivo-csrf": "token", "Content-Type": "application/json", origin: "https://test.invalid" }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const accept = (action = "ACCEPT") => acceptRoute.PATCH(request("/api/driver/ride-requests/respond", "PATCH", { requestId: bookingId, action }));
async function run() {
  for (const remaining of [15 + 5 / 60, 15 + 10 / 60, 30 + 10 / 60, 60 + 10 / 60, 40]) {
    queued.clear(); rows = [ride(remaining)];
    const response = await accept(); assert.equal(response.status, 200); assert.equal((await response.json()).action, "ACCEPTED");
    assert.ok(queued.size > 0);
    const expected = remaining < 16 ? "REMINDER_15M" : remaining > 60 ? "REMINDER_1H" : "REMINDER_ADAPTIVE";
    const reminder = [...queued.values()].find((job) => job.name === expected);
    assert.ok(reminder, "boundary reminder queued by real ACCEPT route before its response returns");
    const milestoneMinutes = remaining < 16 ? 15 : remaining > 60 ? 60 : 30;
    assert.equal(reminder.options.delay, Math.round((remaining - milestoneMinutes) * minute), "future boundary reminder retains its exact delay without waiting for reconciliation");
    assert.ok([...queued.values()].every((job) => job.data.assignedAtMs === now));
    const count = queued.size; await market.scheduleScheduledRideJobs(bookingId); await jobs.reconcileScheduledRideJobs(new Date(now));
    assert.equal(queued.size, count, "direct scheduling and real reconciliation share IDs");
  }
  queued.clear(); rows = [ride()]; const beforeUnacceptedAttempts = queueAttempts;
  for (const action of ["DECLINE", "REJECT"]) {
    const response = await accept(action);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, action: "DECLINED", offerId: bookingId, dispatch: "UNCHANGED" }, "non-accept response stays unchanged and never reaches accepted-ride scheduling");
    assert.equal(queueAttempts, beforeUnacceptedAttempts);
  }
  assert.equal(queued.size, 0);
  acceptOK = false; assert.equal((await accept()).status, 404); assert.equal(queued.size, 0); acceptOK = true;
  assert.equal(queueAttempts, beforeUnacceptedAttempts, "declined, rejected and failed offers never attempt reminder enqueueing");
  rows = [{ ...ride(), scheduledRide: false, pickupAt: new Date(now) }];
  queueFailure = true;
  try {
    const immediateResponse = await accept(); assert.equal(immediateResponse.status, 200); assert.equal((await immediateResponse.json()).action, "ACCEPTED");
  } finally { queueFailure = false; }
  assert.equal(queued.size, 0, "immediate ride safely no-ops");
  assert.equal(queueAttempts, beforeUnacceptedAttempts, "non-scheduled acceptance creates no scheduled queue work");
  rows = [ride()]; queueFailure = true; const errors = []; const originalError = console.error; console.error = (...args) => errors.push(args);
  try { const response = await accept(); assert.equal(response.status, 200); assert.equal((await response.json()).action, "ACCEPTED"); }
  finally { console.error = originalError; queueFailure = false; }
  assert.equal(rows[0].driverId, driverId); assert.equal(+rows[0].acceptedAt, now); assert.equal(errors.length, 1); assert.doesNotMatch(JSON.stringify(errors), /PRIVATE_|injected/);
  await jobs.reconcileScheduledRideJobs(new Date(now)); assert.ok(queued.size > 0, "reconciliation repairs failed enqueue");
  const readyClient = queue.waitUntilReady; queue.waitUntilReady = () => new Promise(() => {}); const beforeAttempts = queueAttempts;
  console.error = () => {};
  try { assert.equal((await accept()).status, 200, "unavailable Redis cannot indefinitely hold the accepted HTTP response"); }
  finally { console.error = originalError; queue.waitUntilReady = readyClient; }
  assert.equal(queueAttempts, beforeAttempts, "offline connection deadline does not enqueue offline commands");

  queued.clear(); rows = Array.from({ length: 750 }, (_, i) => ({ ...ride(600 + i / 60), id: (i + 100).toString(16).padStart(24, "0") }));
  await jobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(new Set([...queued.values()].map((job) => job.data.bookingId)).size, 500);
  await jobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(new Set([...queued.values()].map((job) => job.data.bookingId)).size, 750, "production query pagination covers beyond 100/500");
  const before = queued.size; await jobs.reconcileScheduledRideJobs(new Date(now)); await jobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(queued.size, before);
  rows.push({ ...ride(40), id: "ffffffffffffffffffffffff" });
  await jobs.reconcileScheduledRideJobs(new Date(now)); await jobs.reconcileScheduledRideJobs(new Date(now));
  assert.ok([...queued.values()].some((job) => job.data.bookingId === "ffffffffffffffffffffffff"), "new assignment before current pickup cursor covered on next sweep");
  // A fresh process resets its bounded cursors and repairs existing queue IDs safely.
  cache.delete(path.resolve("lib/scheduled-jobs.ts")); const restartedJobs = load("lib/scheduled-jobs.ts");
  await restartedJobs.reconcileScheduledRideJobs(new Date(now)); await restartedJobs.reconcileScheduledRideJobs(new Date(now));
  assert.equal(new Set([...queued.values()].map((job) => job.data.bookingId)).size, 751);
  queued.clear(); rows = Array.from({ length: 250 }, (_, i) => ({ ...ride(), id: (i + 100).toString(16).padStart(24, "0"), scheduledRide: false, pickupAt: i % 2 ? null : undefined, acceptedAt: null }));
  await restartedJobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(new Set([...queued.values()].map((job) => job.data.bookingId)).size, 250, "null and unset legacy pickups reconstructed and scheduled");

  for (const reconstructed of [false, true]) {
    for (const count of [10, 100, 101, 150, 500, 1001]) {
      cache.delete(path.resolve("lib/scheduled-jobs.ts"));
      const scanner = load("lib/scheduled-jobs.ts");
      queued.clear();
      rows = Array.from({ length: count }, (_, i) => ({
        ...ride(600), id: (i + 100).toString(16).padStart(24, "0"),
        ...(reconstructed ? { scheduledRide: false, pickupAt: i % 2 ? null : undefined, acceptedAt: null } : {}),
      }));
      const readsBefore = pageSizes.length;
      const concurrent = await Promise.all([scanner.reconcileScheduledRideJobs(new Date(now)), scanner.reconcileScheduledRideJobs(new Date(now))]);
      assert.deepEqual(concurrent, [Math.min(count, 500), Math.min(count, 500)], "overlapping calls share the same bounded scan");
      assert.ok(pageSizes.length - readsBefore <= 6, "concurrent reconciliation does not start a second scan");
      for (let pass = 0; pass < Math.ceil(count / 500) + 1; pass++) {
        assert.ok(await scanner.reconcileScheduledRideJobs(new Date(now)) <= 500, "each source advances at most five bounded pages per pass");
      }
      const covered = new Set([...queued.values()].map(job => job.data.bookingId));
      assert.equal(covered.size, count, `${reconstructed ? "reconstructed" : "persisted"} ${count}-ride scan reaches every eligible row`);
      assert.deepEqual([...covered].sort(), rows.map(row => row.id).sort(), "equal pickup instants use the stable ID tie-breaker without skips");
      const jobCount = queued.size;
      for (let pass = 0; pass < Math.ceil(count / 500) + 1; pass++) await scanner.reconcileScheduledRideJobs(new Date(now));
      assert.equal(queued.size, jobCount, "repeated multi-page scans do not create duplicate logical jobs");
    }
  }

  // Exercise the actual persisted-pickup query at the rolling 25-hour boundary.
  cache.delete(path.resolve("lib/scheduled-jobs.ts"));
  const horizonScanner = load("lib/scheduled-jobs.ts");
  queued.clear();
  const horizonStart = now;
  rows = Array.from({ length: 150 }, (_, i) => ({
    ...ride(24 * 60 + 30), id: (i + 6000).toString(16).padStart(24, "0"),
  }));
  const atHorizon = { ...ride(25 * 60), id: "eeeeeeeeeeeeeeeeeeeeeeee" };
  const beyondHorizon = { ...ride(25 * 60), id: "ffffffffffffffffffffffff", pickupAt: new Date(now + 25 * 60 * minute + 1) };
  rows.push(atHorizon, beyondHorizon);
  assert.equal(await horizonScanner.reconcileScheduledRideJobs(new Date(now)), 151, "all 150 qualifying rides plus the exact horizon boundary are reconciled in bounded pages");
  const horizonCoverage = new Set([...queued.values()].map(job => job.data.bookingId));
  assert.ok(horizonCoverage.has(rows[100].id), "row 101 is reached inside the T-24h lookahead");
  assert.ok(horizonCoverage.has(rows[149].id), "the final row after the first page is reached");
  assert.ok(horizonCoverage.has(atHorizon.id), "the exact 25-hour horizon is inclusive");
  assert.equal(horizonCoverage.has(beyondHorizon.id), false, "a persisted pickup beyond 25 hours is not enqueued");
  const firstDayReminder = [...queued.values()].find(job => job.name === "REMINDER_24H" && job.data.bookingId === rows[100].id);
  assert.ok(firstDayReminder, "later pages enqueue the first standard T-24h reminder before its milestone");
  assert.equal(firstDayReminder.options.delay, 30 * minute);
  const horizonJobCount = queued.size;
  await horizonScanner.reconcileScheduledRideJobs(new Date(now));
  assert.equal(queued.size, horizonJobCount, "repeating the horizon scan reuses deterministic job IDs");
  now += minute;
  await horizonScanner.reconcileScheduledRideJobs(new Date(now));
  assert.ok([...queued.values()].some(job => job.data.bookingId === beyondHorizon.id), "a later sweep schedules a ride as it enters the rolling horizon");
  now = horizonStart;

  queued.clear(); rows = [ride(40)]; await market.scheduleScheduledRideJobs(bookingId);
  const failedReminder = [...queued.values()].find(job => job.name === "REMINDER_ADAPTIVE");
  const failedReadiness = [...queued.values()].find(job => job.name === "READINESS_15M");
  const failedReminderId = failedReminder.options.jobId;
  failedReminder.state = "failed"; failedReadiness.state = "failed";
  const retainedJobCount = queued.size;
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.state, "failed", "repair never runs a retained reminder before its milestone");
  assert.equal(failedReadiness.state, "failed", "readiness repair also waits for its milestone");
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.repairs, undefined); assert.equal(failedReadiness.repairs, undefined);
  assert.equal(queued.size, retainedJobCount, "repair reuses retained IDs without duplicate jobs");
  // A real exhaustion normally occurs after the milestone. Repair the retained
  // job then, but never manufacture jobs for missed milestones with no entry.
  now += 26 * minute;
  failedReminder.state = "failed"; failedReadiness.state = "failed";
  retryFailure = true;
  try { await assert.rejects(market.scheduleScheduledRideJobs(bookingId), /injected retry failure/, "genuine retry failure stays recoverable instead of being masked"); }
  finally { retryFailure = false; }
  assert.equal(failedReminder.state, "failed");
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.state, "waiting"); assert.equal(failedReadiness.state, "waiting", "retained overdue readiness can recover without re-creating its job");
  assert.equal(queued.size, retainedJobCount);
  failedReminder.state = "failed"; retryRace = true;
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.state, "waiting", "concurrent repair of the same ID is harmless");
  failedReminder.state = "completed"; failedReadiness.state = "completed";
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.repairs, 1); assert.equal(failedReadiness.repairs, 1, "completed readiness is never restarted by repair");
  queued.clear(); await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(queued.size, 0, "missing past milestones are not created by failed-job repair");
  failedReminder.state = "failed";
  queued.set(failedReminderId, failedReminder);
  rows[0].driverId = otherDriver; rows[0].acceptedAt = new Date(now);
  await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(failedReminder.state, "failed", "replacement scheduling cannot retry the former Driver's retained job");
  assert.equal((await jobs.processScheduledRideJob(failedReminder)).outcome, "STALE_ASSIGNMENT", "former Driver retained job cannot notify after reassignment");
  queued.clear(); rows = [ride(40)]; await market.scheduleScheduledRideJobs(bookingId);
  const adaptive = [...queued.values()].find((job) => job.name === "REMINDER_ADAPTIVE");
  await assert.rejects(jobs.processScheduledRideJob(adaptive), /NOT_DUE/); assert.equal(notifications.length, 0);
  now += 10 * minute;
  await jobs.processScheduledRideJob(adaptive); await jobs.processScheduledRideJob(adaptive);
  assert.equal(notifications.length, 1); assert.equal(outbox.length, 1, "retry creates one atomic notification/event");
  const pending = copy(outbox[0].payload);
  assert.equal(delivery.isScheduledReminderDeliveryCurrent(rows[0], pending), true);
  assert.ok(intervals.includes(30_000), "actual worker keeps 30-second reconciliation");
  outbox[0].state = "QUEUED"; await outboxProcessor({ data: { outboxEventId: outbox[0].id } });
  assert.equal(signals.length, 1); assert.equal(signals[0].room, `driver:${driverId}`); assert.equal(signals[0].type, "booking.updated", "existing Driver listener receives reminder invalidation");
  assert.doesNotMatch(JSON.stringify(signals), /PRIVATE_/);
  rows[0].status = "IN_PROGRESS";
  outbox[0].state = "QUEUED"; await outboxProcessor({ data: { outboxEventId: outbox[0].id } });
  assert.equal(signals.length, 1, "actual worker suppresses a reminder persisted before the ride started");
  assert.equal((await delivery.filterCurrentDriverReminders(notifications, driverId)).length, 0, "started rides hide persisted upcoming reminders");
  rows[0].status = "CONFIRMED";
  rows[0].driverId = otherDriver; rows[0].acceptedAt = new Date(now);
  outbox[0].state = "QUEUED"; await outboxProcessor({ data: { outboxEventId: outbox[0].id } }); assert.equal(signals.length, 1, "actual worker suppresses pending event after reassignment");
  for (const eventType of ["SCHEDULED_REMINDER_30", "SCHEDULED_WARNING_20"]) {
    outbox[0].eventType = eventType; outbox[0].state = "QUEUED";
    await outboxProcessor({ data: { outboxEventId: outbox[0].id } }); assert.equal(signals.length, 1, "obsolete legacy outbox events are suppressed");
  }
  assert.equal(delivery.isScheduledReminderDeliveryCurrent(rows[0], pending), false, "pending outbox cannot target former Driver");
  assert.equal((await delivery.filterCurrentDriverReminders(notifications, driverId)).length, 0, "old persisted reminder is not shown after reassignment");
  assert.equal((await jobs.processScheduledRideJob(adaptive)).outcome, "STALE_ASSIGNMENT");
  rows[0] = { ...ride(40), driverId: otherDriver }; await market.scheduleScheduledRideJobs(bookingId);
  assert.ok([...queued.values()].some((job) => job.data.driverId === otherDriver && job.data.assignedAtMs === now));
  for (const replacementId of [otherDriver, driverId]) {
    now += 1; rows[0] = { ...ride(40), driverId: replacementId };
    await market.scheduleScheduledRideJobs(bookingId);
    const replacement = [...queued.values()].find((job) => job.name === "REMINDER_ADAPTIVE" && job.data.driverId === replacementId && job.data.assignedAtMs === now);
    now += 10 * minute;
    await jobs.processScheduledRideJob(replacement); await jobs.processScheduledRideJob(replacement);
  }
  assert.equal(notifications.length, 3, "replacement and legitimate later same-Driver assignment each receive their own reminder");
  assert.equal(new Set(notifications.map((item) => item.dedupeKey)).size, 3);

  rows = [ride(40)]; notifications = []; outbox = []; queued.clear(); await market.scheduleScheduledRideJobs(bookingId);
  const retryJob = [...queued.values()].find((job) => job.name === "REMINDER_ADAPTIVE"); now += 10 * minute;
  failOutbox = true; await assert.rejects(jobs.processScheduledRideJob(retryJob)); assert.equal(notifications.length, 0, "notification rolls back if outbox write fails"); failOutbox = false;
  await jobs.processScheduledRideJob(retryJob); assert.equal(notifications.length, 1); assert.equal(outbox.length, 1);
  rows = [ride(40)]; notifications = []; outbox = []; queued.clear(); await market.scheduleScheduledRideJobs(bookingId);
  const raceJob = [...queued.values()].find((job) => job.name === "REMINDER_ADAPTIVE"); now += 10 * minute; raceOnWrite = true;
  await jobs.processScheduledRideJob(raceJob); assert.equal(notifications.length, 0, "assignment change between read and write retries ownership and suppresses notification"); assert.equal(outbox.length, 0);

  for (const name of ["T30", "T20", "SCHEDULED_REMINDER_30", "SCHEDULED_WARNING_20", "UNKNOWN"]) {
    const result = await jobs.processScheduledRideJob({ name, data: { bookingId, pickupAtMs: now + minute } });
    assert.match(result.outcome, /IGNORED/);
  }
  for (const name of ["T30", "T20", "UNKNOWN"]) assert.match((await jobs.processScheduledRideJob({ name, data: null })).outcome, /IGNORED/);
  for (const data of [null, {}, { bookingId: "bad-id", pickupAtMs: now + minute }, { bookingId, pickupAtMs: NaN }]) {
    assert.equal((await jobs.processScheduledRideJob({ name: "T15", data })).outcome, "INVALID_JOB_IGNORED");
  }
  for (const state of ["CANCELLED", "COMPLETED", "NO_SHOW", "IN_PROGRESS"]) {
    rows = [{ ...ride(40), status: state }]; assert.equal((await jobs.processScheduledRideJob(raceJob)).outcome, "NOOP");
    queued.clear(); await market.scheduleScheduledRideJobs(bookingId);
    assert.equal(queued.size, 0, "terminal or already-started rides never enqueue upcoming jobs");
    assert.equal(await jobs.reconcileScheduledRideJobs(), 0, "reconciliation excludes terminal or already-started rides");
    assert.equal(delivery.isScheduledReminderDeliveryCurrent(rows[0], { ...pending, pickupAt: rows[0].pickupAt.toISOString(), assignedAtMs: +rows[0].acceptedAt }), false, "late outbox delivery cannot signal a terminal or already-started ride");
  }
  rows = [{ ...ride(40), pickupAt: new Date(raceJob.data.pickupAtMs + minute) }]; assert.equal((await jobs.processScheduledRideJob(raceJob)).outcome, "STALE");
  rows = [{ ...ride(), pickupAt: new Date(now - 1) }]; assert.equal((await jobs.processScheduledRideJob({ name: "T15", data: { bookingId, pickupAtMs: +rows[0].pickupAt } })).outcome, "STALE");
  // Durable completion prevents a READY assignment from being checked again
  // after its Redis entry disappears, and repairs a partial notification write.
  rows = [{ ...ride(8), passengerCount: 1, luggageType: "NONE" }]; notifications = []; outbox = []; queued.clear();
  actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: true, isOnTrip: false, vehicleType: "STANDARD", vehicleCapacity: 4, lastLocationReceivedAt: new Date(now) };
  await market.scheduleScheduledRideJobs(bookingId);
  const completedReadiness = [...queued.values()].find((job) => job.name === "READINESS_15M");
  assert.equal((await jobs.processScheduledRideJob(completedReadiness)).outcome, "READY");
  const readyWrites = outboxCreateAttempts;
  queued.clear(); notifications = [];
  await market.scheduleScheduledRideJobs(bookingId);
  await jobs.processScheduledRideJob(completedReadiness);
  await jobs.processScheduledRideJob({ name: "SCHEDULED_READINESS_CHECK", data: { bookingId, pickupAtMs: +rows[0].pickupAt } });
  assert.equal(outboxCreateAttempts, readyWrites, "queue removal/retry and legacy readiness do not repeat a completed readiness action");
  assert.equal(notifications.length, 1, "a missing readiness notification is repaired once");
  rows = [{ ...ride(8), passengerCount: 1, luggageType: "NONE" }]; notifications = []; outbox = [];
  raceOnWrite = true;
  const racedReadiness = { name: "READINESS_15M", data: { bookingId, pickupAtMs: +rows[0].pickupAt, driverId, assignedAtMs: now } };
  assert.equal((await jobs.processScheduledRideJob(racedReadiness)).outcome, "NOOP", "readiness persistence revalidates assignment after a concurrent ownership change");
  assert.equal(notifications.length, 0); assert.equal(outbox.length, 0, "former Driver readiness cannot leave a persisted notification/event");
  raceOnWrite = false;
  rows = [{ ...ride(8), passengerCount: 1, luggageType: "NONE" }]; notifications = []; outbox = [];
  failOutbox = true;
  try { await assert.rejects(jobs.processScheduledRideJob({ ...racedReadiness, data: { ...racedReadiness.data, pickupAtMs: +rows[0].pickupAt } })); }
  finally { failOutbox = false; }
  assert.equal(notifications.length, 0); assert.equal(outbox.length, 0, "readiness notification and event commit atomically");
  await jobs.processScheduledRideJob({ ...racedReadiness, data: { ...racedReadiness.data, pickupAtMs: +rows[0].pickupAt } });
  const readyEvent = outbox[0]; readyEvent.state = "QUEUED";
  const beforeCurrentReadySignals = signals.length;
  await outboxProcessor({ data: { outboxEventId: readyEvent.id } });
  assert.equal(signals.length, beforeCurrentReadySignals + 1, "current readiness completion retains its Driver realtime signal");
  assert.doesNotMatch(JSON.stringify(readyEvent.payload), /PRIVATE_/);
  readyEvent.state = "QUEUED";
  rows[0].driverId = otherDriver; rows[0].acceptedAt = new Date(now + 1);
  const beforeReadySignals = signals.length;
  await outboxProcessor({ data: { outboxEventId: readyEvent.id } });
  assert.equal(signals.length, beforeReadySignals, "pending readiness event cannot signal a replacement Driver");
  rows[0].driverId = driverId; rows[0].acceptedAt = new Date(now);
  now += 5 * minute + 1; queued.clear(); await market.scheduleScheduledRideJobs(bookingId);
  assert.equal(queued.size, 0, "reconciliation cannot recreate readiness outside assignment grace after completed-job removal");
  actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false };
  rows = [ride(8)]; outbox = []; notifications = [];
  assert.equal((await market.releaseScheduledAssignment(prisma, rows[0], "manual")).ok, false, "manual release lead-time restriction unchanged");
  const readiness = { name: "READINESS_15M", data: { bookingId, pickupAtMs: +rows[0].pickupAt, driverId, assignedAtMs: +rows[0].acceptedAt } };
  await jobs.processScheduledRideJob(readiness); assert.equal(recoveryCount, 1, "late fresh readiness can release an unavailable assigned Driver and start recovery");
  await jobs.processScheduledRideJob({ ...readiness, name: "T15" }); assert.equal(recoveryCount, 1, "legacy and new readiness cannot release the same assignment twice");
  assert.equal(rows[0].driverId, null); assert.equal(rows[0].acceptedAt, null);
  now += 1; rows[0] = ride(8); await jobs.processScheduledRideJob({ ...readiness, data: { ...readiness.data, pickupAtMs: +rows[0].pickupAt, assignedAtMs: now } }); assert.equal(recoveryCount, 2, "fresh assignment recovery uses its own durable identity");
  now += 1; rows[0] = ride(8); recoveryFailure = true;
  await assert.rejects(jobs.processScheduledRideJob({ ...readiness, data: { ...readiness.data, pickupAtMs: +rows[0].pickupAt, assignedAtMs: now } }));
  recoveryFailure = false;
  const recoveryEvent = outbox.filter((event) => event.eventType === "SCHEDULED_READINESS_FAILED").at(-1);
  recoveryEvent.state = "QUEUED"; await outboxProcessor({ data: { outboxEventId: recoveryEvent.id } }); assert.equal(recoveryCount, 3, "durable outbox retries recovery after committed release");

  // Connect readiness release to the real atomic acceptance service and HTTP
  // route. Only persistence/queue/provider adapters are isolated; acceptance,
  // compatibility, ownership, planning and post-commit scheduling run unchanged.
  const originalOperations = mocks["@/lib/driver-operations"];
  mocks["@/lib/commission-engine"] = { calculateBookingFinancialBreakdown: () => ({}), createOrUpdateDriverEarningForBooking: async () => { throw new Error("Unexpected earning write"); } };
  mocks["@/lib/earnings-ledger"] = { postTripEarningLedger: async () => { throw new Error("Unexpected ledger write"); } };
  mocks["@/lib/dispatch-config"] = { getDispatchConfig: () => ({ ok: true, config: { offerTtlSeconds: 30, locationMaxAgeSeconds: 120 } }) };
  mocks["@/lib/driver-operations"] = load("lib/driver-operations.ts");
  cache.delete(path.resolve("app/api/driver/ride-requests/respond/route.ts"));
  const recoveryAcceptRoute = load("app/api/driver/ride-requests/respond/route.ts");
  // 09:29:45 Bratislava acceptance for a 10:00 pickup must enqueue T-30
  // before the HTTP response, using the real committed acceptance timestamp.
  // Also exercise T-1h/T-15m boundaries and ordinary immediate acceptance.
  const beforeBoundaryChecks = now;
  for (const [remaining, expectedKind, expectedDelay] of [
    [30 + 20 / 60, "REMINDER_ADAPTIVE", 20_000],
    [30 + 15 / 60, "REMINDER_ADAPTIVE", 15_000],
    [30 + 10 / 60, "REMINDER_ADAPTIVE", 10_000],
    [60 + 10 / 60, "REMINDER_1H", 10_000],
    [15 + 20 / 60, "REMINDER_15M", 20_000],
    [15 + 10 / 60, "REMINDER_15M", 10_000],
    [15 + 5 / 60, "REMINDER_15M", 5_000],
    [0, null, 0],
  ]) {
    now = Date.UTC(2026, 0, 10, 8, 29, 45);
    actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: true, isOnTrip: false, currentLat: 48.1, currentLng: 17.1, lastLocationReceivedAt: new Date(now), vehicleType: "STANDARD", vehicleCapacity: 4 };
    rows = [{ ...ride(remaining), driverId: null, acceptedAt: null, status: "CONFIRMED", dispatchStatus: "SEARCHING_DRIVER", scheduledRide: remaining > 0, passengerCount: 1, luggageType: "NONE", paymentMethod: "CASH" }];
    const offerId = "444444444444444444444444";
    offers = [{ id: offerId, bookingId, driverId, status: "PENDING", expiresAt: new Date(now + 30_000) }];
    notifications = []; outbox = []; queued.clear();
    const attemptsBeforeAccept = queueAttempts;
    const response = await recoveryAcceptRoute.PATCH(request("/api/driver/ride-requests/respond", "PATCH", { requestId: offerId, action: "ACCEPT" }));
    assert.equal(response.status, 200); assert.equal((await response.json()).action, "ACCEPTED");
    assert.equal(offers[0].status, "ACCEPTED"); assert.equal(rows[0].driverId, driverId);
    assert.equal(+rows[0].acceptedAt, now, "real atomic acceptance creates the current assignment identity");
    const reminder = [...queued.values()].find(job => job.name === expectedKind);
    if (expectedKind) {
      assert.ok(reminder, "real automatic/recovery ACCEPT enqueues its future boundary reminder before returning");
      assert.equal(reminder.options.delay, expectedDelay);
      assert.equal(reminder.data.assignedAtMs, +rows[0].acceptedAt);
    } else {
      assert.equal(queued.size, 0); assert.equal(queueAttempts, attemptsBeforeAccept, "real immediate acceptance performs no scheduled enqueueing");
    }
    const jobCount = queued.size;
    await market.scheduleScheduledRideJobs(bookingId); await jobs.reconcileScheduledRideJobs(new Date(now));
    assert.equal(queued.size, jobCount, "direct scheduling and reconciliation share deterministic IDs after real acceptance");
    if (reminder) {
      now += expectedDelay;
      await jobs.processScheduledRideJob(reminder); await jobs.processScheduledRideJob(reminder);
      assert.equal(notifications.length, 1);
      assert.equal(outbox.filter(event => event.eventType === "SCHEDULED_RIDE_REMINDER").length, 1, "retried boundary reminder has one persisted notification and outbox event");
    }
  }
  now = beforeBoundaryChecks;
  for (const enqueueFails of [false, true]) {
    now += minute;
    actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false, isOnTrip: false };
    rows = [{ ...ride(40), passengerCount: 1, luggageType: "NONE", paymentMethod: "CASH" }];
    notifications = []; outbox = []; queued.clear();
    const formerAssignment = +rows[0].acceptedAt;
    await market.scheduleScheduledRideJobs(bookingId);
    const formerReadiness = [...queued.values()].find((job) => job.name === "READINESS_15M");
    now = +rows[0].pickupAt - 15 * minute;
    const beforeRecovery = recoveryCount;
    await jobs.processScheduledRideJob(formerReadiness);
    assert.equal(recoveryCount, beforeRecovery + 1);
    assert.equal(rows[0].driverId, null); assert.equal(rows[0].acceptedAt, null);

    now += 1;
    actor = { id: otherDriver, status: "ACTIVE", authVersion: 0, isOnline: true, isOnTrip: false, currentLat: 48.1, currentLng: 17.1, lastLocationReceivedAt: new Date(now), vehicleType: "STANDARD", vehicleCapacity: 4 };
    rows[0].dispatchStatus = "SEARCHING_DRIVER";
    const recoveryOfferId = "444444444444444444444444";
    offers = [{ id: recoveryOfferId, bookingId, driverId: otherDriver, status: "PENDING", expiresAt: new Date(now + 30_000) }];
    queueFailure = enqueueFails;
    const attemptsBeforeRecoveryAccept = queueAttempts;
    const capturedErrors = [], savedConsoleError = console.error;
    console.error = (...args) => capturedErrors.push(args);
    let accepted;
    try {
      accepted = await recoveryAcceptRoute.PATCH(request("/api/driver/ride-requests/respond", "PATCH", { requestId: recoveryOfferId, action: "ACCEPT" }));
    } finally { queueFailure = false; console.error = savedConsoleError; }
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { success: true, action: "ACCEPTED", offerId: recoveryOfferId, bookingId }, "post-commit enqueue failure preserves the entire successful acceptance response");
    assert.ok(queueAttempts > attemptsBeforeRecoveryAccept, "real committed recovery acceptance attempts immediate enqueue even when Redis scheduling fails");
    assert.equal(offers[0].status, "ACCEPTED"); assert.equal(rows[0].driverId, otherDriver);
    assert.equal(rows[0].status, "ASSIGNED"); assert.equal(rows[0].dispatchStatus, "ACCEPTED");
    assert.equal(+rows[0].acceptedAt, now); assert.notEqual(+rows[0].acceptedAt, formerAssignment);
    assert.ok(outbox.some((event) => event.eventType === "DRIVER_OFFER_ACCEPTED" && event.payload.driverId === otherDriver));
    assert.equal(capturedErrors.length, enqueueFails ? 1 : 0); assert.doesNotMatch(JSON.stringify(capturedErrors), /PRIVATE_|injected/);
    if (enqueueFails) assert.deepEqual(capturedErrors, [["[driver.scheduled-reminders.schedule-failed]", { code: "SCHEDULED_REMINDER_ENQUEUE_FAILED" }]], "post-commit queue failure logs only the generic operational code");
    assert.equal([...queued.values()].some((job) => job.data.driverId === otherDriver), !enqueueFails, "replacement is scheduled immediately, except during injected queue failure");
    await jobs.reconcileScheduledRideJobs(new Date(now));
    const replacementJobs = [...queued.values()].filter((job) => job.data.driverId === otherDriver);
    assert.equal(replacementJobs.length, 1, "post-T15 replacement gets readiness only, without stale reminder bursts");
    assert.equal(replacementJobs[0].name, "READINESS_15M"); assert.equal(replacementJobs[0].data.assignedAtMs, now);
    assert.notEqual(replacementJobs[0].options.jobId, formerReadiness.options.jobId);
    assert.equal((await jobs.processScheduledRideJob(formerReadiness)).outcome, "STALE_ASSIGNMENT");
    const jobCount = queued.size, attempts = queueAttempts;
    const retry = await recoveryAcceptRoute.PATCH(request("/api/driver/ride-requests/respond", "PATCH", { requestId: recoveryOfferId, action: "ACCEPT" }));
    assert.equal(retry.status, 409); assert.equal(queueAttempts, attempts, "already-responded acceptance does not schedule again");
    await jobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(queued.size, jobCount);
  }
  mocks["@/lib/driver-operations"] = originalOperations;

  // Exercise all remaining production assignment entry points with their real
  // services and scheduler; only database, queue and auth credentials are isolated.
  const claimRoute = load("app/api/driver/scheduled-rides/[id]/claim/route.ts");
  const adminAssignRoute = load("app/api/admin/operations/assign/route.ts");
  const adminBookingRoute = load("app/api/admin/bookings/route.ts");
  const adminRequest = (url, method, body) => new NextRequest(`https://test.invalid${url}`, {
    method, headers: { cookie: "admin-session=admin-valid; csrf=token", "x-drivo-csrf": "token", "Content-Type": "application/json", origin: "https://test.invalid" }, body: JSON.stringify(body),
  });
  const assignments = [
    ["marketplace claim", () => claimRoute.POST(request(`/api/driver/scheduled-rides/${bookingId}/claim`, "POST"), { params: Promise.resolve({ id: bookingId }) })],
    ["Admin Operations", () => adminAssignRoute.POST(adminRequest("/api/admin/operations/assign", "POST", { bookingId, driverId, reason: "Assign scheduled ride", requestId: "scheduled-admin-assignment" }))],
    ["Admin compatibility", () => adminBookingRoute.PATCH(adminRequest("/api/admin/bookings", "PATCH", { bookingId, driverId, status: "ASSIGNED" }))],
  ];
  for (const [label, assign] of assignments) {
    for (const enqueueFails of [false, true]) {
      now += minute;
      actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: true, isOnTrip: false, vehicleType: "STANDARD", vehicleCapacity: 4 };
      rows = [{ ...ride(40), driverId: null, acceptedAt: new Date(now - minute), status: "CONFIRMED", dispatchStatus: "NOT_STARTED", paymentMethod: "CASH", passengerCount: 1, luggageType: "NONE", pickupLat: 48.1, pickupLng: 17.1, dropoffLat: 48.2, dropoffLng: 17.2 }];
      offers = []; outbox = []; adminAudits = []; notifications = []; queued.clear(); queueFailure = enqueueFails;
      const capturedErrors = [], savedError = console.error, savedLog = console.log;
      console.error = (...args) => capturedErrors.push(args); console.log = () => {};
      let assigned;
      try { assigned = await assign(); }
      finally { queueFailure = false; console.error = savedError; console.log = savedLog; }
      assert.equal(assigned.status, 200, `${label} preserves committed success during queue failure`);
      assert.equal((await assigned.json()).success, true);
      assert.equal(rows[0].driverId, driverId); assert.equal(+rows[0].acceptedAt, now, `${label} commits a fresh assignment identity`);
      assert.equal(capturedErrors.length, enqueueFails ? 1 : 0); assert.doesNotMatch(JSON.stringify(capturedErrors), /PRIVATE_|injected|333333333333333333333333/);
      assert.equal(queued.size > 0, !enqueueFails, `${label} schedules immediately after commit`);
      await jobs.reconcileScheduledRideJobs(new Date(now));
      const adaptiveJob = [...queued.values()].find((job) => job.name === "REMINDER_ADAPTIVE");
      assert.ok(adaptiveJob, `${label} fallback repairs a failed enqueue`); assert.equal(adaptiveJob.options.delay, 10 * minute);
      assert.ok([...queued.values()].every((job) => job.data.assignedAtMs === now));
      const count = queued.size, assignmentTimestamp = +rows[0].acceptedAt;
      console.log = () => {};
      let retry;
      try { retry = await assign(); } finally { console.log = savedLog; }
      assert.equal(retry.status, 200);
      assert.equal(+rows[0].acceptedAt, assignmentTimestamp, `${label} retry does not refresh assignment identity`);
      await jobs.reconcileScheduledRideJobs(new Date(now)); assert.equal(queued.size, count, `${label} retry/reconciliation uses the same deterministic IDs`);
      now += 10 * minute;
      await jobs.processScheduledRideJob(adaptiveJob); await jobs.processScheduledRideJob(adaptiveJob);
      assert.equal(notifications.length, 1, `${label} duplicate processing persists only one reminder`);
      assert.equal(outbox.filter((event) => event.eventType === "SCHEDULED_RIDE_REMINDER").length, 1, `${label} emits only one reminder event`);
      // A rejected assignment must not reach the scheduler, even though the
      // same booking would otherwise still have schedulable future milestones.
      rows[0].driverId = null; actor.status = "INACTIVE"; adminAudits = [];
      const attempts = queueAttempts; console.log = () => {};
      try { const rejected = await assign(); assert.ok(rejected.status >= 400, `${label} rejects an ineligible Driver`); }
      finally { console.log = savedLog; }
      assert.equal(queueAttempts, attempts, `${label} failed assignment never queues jobs`);
    }
  }
  for (const [label, assign] of assignments.slice(1)) {
    now += minute;
    actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: true, isOnTrip: false, vehicleType: "STANDARD", vehicleCapacity: 4 };
    rows = [{ ...ride(), driverId: null, acceptedAt: null, scheduledRide: false, pickupAt: new Date(now), status: "CONFIRMED", paymentMethod: "CASH", passengerCount: 1, luggageType: "NONE" }];
    offers = []; outbox = []; adminAudits = []; queued.clear(); const attempts = queueAttempts;
    const savedLog = console.log; console.log = () => {};
    try { const assigned = await assign(); assert.equal(assigned.status, 200); assert.equal((await assigned.json()).success, true); }
    finally { console.log = savedLog; }
    assert.equal(queueAttempts, attempts, `${label} immediate assignment performs no scheduled enqueueing`);
    assert.equal(queued.size, 0);
  }
  // Both possible T-15 execution orders retain operational recovery. A
  // reminder committed before release is suppressed at the delivery boundary.
  for (const reminderFirst of [false, true]) {
    now += minute;
    actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false };
    rows = [ride(40)]; notifications = []; outbox = []; queued.clear();
    await market.scheduleScheduledRideJobs(bookingId);
    const reminder = [...queued.values()].find((job) => job.name === "REMINDER_15M");
    const readiness = [...queued.values()].find((job) => job.name === "READINESS_15M");
    assert.ok(reminder && readiness, "T-15 reminder and readiness remain separate jobs");
    now += 25 * minute;
    const priorRecoveryCount = recoveryCount;
    if (reminderFirst) assert.equal((await jobs.processScheduledRideJob(reminder)).outcome, "NOTIFIED");
    assert.equal((await jobs.processScheduledRideJob(readiness)).outcome, "RECOVERY");
    assert.equal(recoveryCount, priorRecoveryCount + 1, "reminder ordering never delays operational release/recovery");
    assert.equal(rows[0].driverId, null); assert.equal(rows[0].acceptedAt, null);
    assert.equal((await jobs.processScheduledRideJob(reminder)).outcome, "NOOP", "released assignment cannot receive a reminder");
    await jobs.processScheduledRideJob(readiness);
    assert.equal(recoveryCount, priorRecoveryCount + 1, "retry cannot recover the released assignment twice");
    const reminderEvents = outbox.filter((event) => event.eventType === "SCHEDULED_RIDE_REMINDER");
    assert.equal(reminderEvents.length, reminderFirst ? 1 : 0);
    const priorSignals = signals.length;
    for (const event of reminderEvents) {
      event.state = "QUEUED"; await outboxProcessor({ data: { outboxEventId: event.id } });
    }
    assert.equal(signals.length, priorSignals, "a pending T-15 reminder cannot signal the released Driver");
    assert.equal((await delivery.filterCurrentDriverReminders(notifications, driverId)).length, 0);
  }
  // A worker restart after several milestones must not deliver a stale burst.
  now += minute;
  rows = [ride(30 * 60)]; notifications = []; outbox = []; queued.clear();
  await market.scheduleScheduledRideJobs(bookingId);
  const backlog = [...queued.values()].filter((job) => job.name.startsWith("REMINDER_"));
  const dayReminder = backlog.find((job) => job.name === "REMINDER_24H");
  now += 6 * 60 * minute;
  assert.equal((await jobs.processScheduledRideJob(dayReminder)).outcome, "NOTIFIED");
  const delayedDayEvent = outbox[0];
  now = +rows[0].pickupAt - 15 * minute;
  for (const reminder of backlog) {
    assert.equal((await jobs.processScheduledRideJob(reminder)).outcome,
      reminder.name === "REMINDER_15M" ? "NOTIFIED" : "SUPERSEDED_REMINDER");
  }
  assert.equal(notifications.length, 2, "downtime adds only the latest useful reminder alongside the earlier persisted one");
  assert.equal((await delivery.filterCurrentDriverReminders(notifications, driverId)).length, 1, "old milestones do not form a visible reminder burst");
  assert.equal(outbox.length, 2);
  assert.equal(delivery.isScheduledReminderDeliveryCurrent(rows[0], delayedDayEvent.payload), false, "a delayed old outbox reminder is also suppressed");
  const legacyReminderPayload = { ...delayedDayEvent.payload }; delete legacyReminderPayload.kind;
  assert.equal(delivery.isScheduledReminderDeliveryCurrent(rows[0], legacyReminderPayload), false, "queued payloads from before kind was added remain safe");
  const beforeBacklogSignals = signals.length;
  delayedDayEvent.state = "QUEUED";
  await outboxProcessor({ data: { outboxEventId: delayedDayEvent.id } });
  assert.equal(signals.length, beforeBacklogSignals, "worker does not relay an obsolete reminder after downtime");
  actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false };
  rows = [ride()];
  const calendar = (id = bookingId, authenticated = true) => calendarRoute.GET(request(`/api/driver/scheduled-rides/${id}/calendar`, "GET", undefined, authenticated), { params: Promise.resolve({ id }) });
  let response = await calendar(); assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8"); assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("content-disposition"), /^attachment; filename="drivo-ride-/);
  const content = await response.text(); assert.match(content, /DTSTART:.*Z\r\n/); assert.match(content, /UID:333333333333333333333333@drivo/); assert.doesNotMatch(content, /PRIVATE_|DTEND|DURATION/);
  const eventUid = (text) => text.match(/^UID:(.+)\r$/m)?.[1];
  const repeatedContent = await (await calendar()).text();
  assert.equal(eventUid(repeatedContent), eventUid(content), "repeat downloads use one stable event UID");
  rows[0].pickupAt = new Date(+rows[0].pickupAt + 15 * minute);
  const updatedContent = await (await calendar()).text();
  assert.equal(eventUid(updatedContent), eventUid(content), "changed pickup keeps the booking UID");
  assert.notEqual(updatedContent.match(/^DTSTART:.+$/m)[0], content.match(/^DTSTART:.+$/m)[0], "a later download reflects the new authoritative pickup");
  rows[0].driverId = otherDriver; rows[0].acceptedAt = new Date(now + 1);
  assert.equal((await calendar()).status, 404, "former Driver cannot download again after reassignment");
  actor.id = otherDriver;
  const replacementContent = await (await calendar()).text();
  assert.equal(eventUid(replacementContent), eventUid(content), "new owner exports the same booking identity without private assignment IDs");
  rows[0].status = "CANCELLED";
  assert.equal((await calendar()).status, 404, "cancellation blocks subsequent calendar exports");
  assert.match(content, /STATUS:CONFIRMED/, "previously downloaded ICS is a static snapshot, not an automatically synchronized event");
  actor.id = driverId; rows = [ride()];
  const i18n = load("lib/i18n/index.ts");
  for (const locale of i18n.locales) {
    const localized = await calendarRoute.GET(request(`/api/driver/scheduled-rides/${bookingId}/calendar?locale=${locale}`), { params: Promise.resolve({ id: bookingId }) });
    assert.equal(localized.status, 200);
    assert.ok((await localized.text()).replace(/\r\n /g, "").includes(i18n.getTranslation(locale, "driverPortal.calendarRideSummary")));
  }
  assert.equal((await calendar(bookingId, false)).status, 401); actor.status = "INACTIVE"; assert.equal((await calendar()).status, 401); actor.status = "ACTIVE";
  assert.equal((await calendar("bad-id")).status, 400);
  rows[0].driverId = otherDriver; assert.equal((await calendar()).status, 404); rows[0] = ride();
  for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) { rows[0].status = status; assert.equal((await calendar()).status, 404); }
  rows[0] = { ...ride(), pickupAt: new Date(now - 1) }; assert.equal((await calendar()).status, 404);
  rows[0] = { ...ride(), scheduledRide: false }; assert.equal((await calendar()).status, 404);
  rows[0] = { ...ride(), pickupAt: null, scheduledDate: "invalid" }; assert.equal((await calendar()).status, 404);
  rows[0] = { ...ride(), bookingRef: 'bad"\r\nX-Injected: yes' }; response = await calendar(); assert.equal(response.status, 200); assert.equal(response.headers.get("x-injected"), null); assert.doesNotMatch(response.headers.get("content-disposition"), /[\r\n]/);
  const savedFindFirst = prisma.booking.findFirst; prisma.booking.findFirst = async () => { throw new Error("PRIVATE_DATABASE_FAILURE"); };
  const savedError = console.error; console.error = () => {};
  try { response = await calendar(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /PRIVATE_/); assert.equal(response.headers.get("cache-control"), "no-store"); }
  finally { prisma.booking.findFirst = savedFindFirst; console.error = savedError; }
  // Exercise the actual relay separately from the worker's timer adapter.
  delete mocks["@/lib/outbox-relay"];
  const relay = load("lib/outbox-relay.ts");
  for (const eventType of ["SCHEDULED_RIDE_REMINDER", "SCHEDULED_READINESS_CHECKED", "SCHEDULED_READINESS_FAILED"]) {
    queued.clear(); outbox = [{ id: bookingId, eventType, state: "PROCESSING" }];
    await relay.enqueueOutboxEvent(outbox[0]);
    const retained = queued.get(`outbox-${bookingId}`); retained.state = "failed"; outbox[0].state = "PROCESSING";
    await relay.enqueueOutboxEvent(outbox[0]);
    assert.equal(retained.state, "waiting", `${eventType} relay repairs an exhausted retained delivery job`);
    assert.equal(outbox[0].state, "QUEUED"); assert.equal(queued.size, 1);
    outbox[0].state = "PROCESSING"; await relay.enqueueOutboxEvent(outbox[0]);
    assert.equal(retained.repairs, 1, "repeated relay does not retry an already waiting event");
    retained.state = "failed"; retryFailure = true; outbox[0].state = "PROCESSING";
    try { await assert.rejects(relay.enqueueOutboxEvent(outbox[0]), /injected retry failure/); }
    finally { retryFailure = false; }
    assert.equal(outbox[0].state, "PROCESSING", "failed repair is not falsely marked queued");
    retryRace = true; await relay.enqueueOutboxEvent(outbox[0]);
    assert.equal(retained.state, "waiting", "concurrent outbox repair shares the existing job");
  }
  for (const eventType of ["DRIVER_OFFER_ACCEPTED", "TRANSACTIONAL_EMAIL"]) {
    queued.clear(); outbox = [{ id: bookingId, eventType, state: "PROCESSING" }];
    await relay.enqueueOutboxEvent(outbox[0]);
    const retained = queued.get(`outbox-${bookingId}`); retained.state = "failed"; outbox[0].state = "PROCESSING";
    await relay.enqueueOutboxEvent(outbox[0]);
    assert.equal(retained.state, "failed", "non-feature outbox delivery behavior stays unchanged");
  }
  console.log("Scheduled Driver runtime checks passed: offer/marketplace/both Admin assignments, queue failure/retained-job repair, 10/100/101/150/500/1001-row persisted/reconstructed reconciliation and 25-hour horizon, ownership races, atomic reminder/readiness delivery, calendar auth/privacy/lifecycle.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.Date = RealDate; });
