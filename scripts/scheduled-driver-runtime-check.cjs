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
const minute = 60_000;
let rows = [], notifications = [], outbox = [], actor = { id: driverId, status: "ACTIVE", authVersion: 0, isOnline: false };
let transactionOpen = false, queueFailure = false, failOutbox = false, raceOnWrite = false, acceptOK = true, recoveryCount = 0, queueAttempts = 0, recoveryFailure = false;
const queued = new Map(), pageSizes = [];
const processors = new Map(), signals = [], intervals = [];
function match(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => match(row, item));
    if (key === "OR") return value.some((item) => match(row, item));
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
  },
  driver: { findUnique: async () => actor },
  adminUser: { findMany: async () => [] },
  notification: { upsert: async ({ where, create }) => { const prior = notifications.find((row) => row.dedupeKey === where.dedupeKey); if (prior) return prior; notifications.push(create); return create; } },
  outboxEvent: {
    findUnique: async ({ where }) => outbox.find((row) => match(row, where)) || null,
    create: async ({ data }) => {
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
const queue = { waitUntilReady: () => Promise.resolve(), add: async (kind, data, options) => {
  assert.equal(transactionOpen, false, "Redis is never called in the assignment transaction");
  queueAttempts++;
  if (queueFailure) throw new Error("injected queue failure");
  if (!queued.has(options.jobId)) queued.set(options.jobId, { name: kind, data, options });
} };
const mocks = {
  "@/lib/prisma": { prisma },
  "@/lib/realtime/queues": { getScheduledRideQueue: () => queue },
  "bullmq": { Worker: class { constructor(name, handler) { processors.set(name, handler); } on() {} } },
  "@socket.io/redis-emitter": { Emitter: class { of() { return this; } to(room) { this.room = room; return this; } emit(type, payload) { signals.push({ room: this.room, type, payload }); } } },
  "@/lib/realtime/redis": { createRedisConnection: () => ({}) },
  "@/lib/outbox-relay": { relayOutboxOnce: async () => ({ queued: 0 }) },
  "@/lib/email": { bookingToEmailData: () => ({}), sendNoDriverAdminEscalation: async () => {} },
  "@/lib/security/session": {
    sessionCookieName: () => "driver-session", csrfCookieName: () => "csrf", hashCsrfToken: () => "hash",
    verifyCanonicalToken: async (token) => token === "valid" ? { sub: driverId, ver: 0, csrf: "hash" } : null,
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
  for (const remaining of [15 + 5 / 60, 30 + 10 / 60, 60 + 10 / 60, 40]) {
    queued.clear(); rows = [ride(remaining)];
    const response = await accept(); assert.equal(response.status, 200); assert.equal((await response.json()).action, "ACCEPTED");
    assert.ok(queued.size > 0);
    const expected = remaining < 16 ? "REMINDER_15M" : remaining > 60 ? "REMINDER_1H" : "REMINDER_ADAPTIVE";
    assert.ok([...queued.values()].some((job) => job.name === expected), "boundary reminder queued by real ACCEPT route");
    assert.ok([...queued.values()].every((job) => job.data.assignedAtMs === now));
    const count = queued.size; await market.scheduleScheduledRideJobs(bookingId); await jobs.reconcileScheduledRideJobs(new Date(now));
    assert.equal(queued.size, count, "direct scheduling and real reconciliation share IDs");
  }
  queued.clear(); rows = [ride()]; await accept("DECLINE"); await accept("REJECT"); assert.equal(queued.size, 0);
  acceptOK = false; assert.equal((await accept()).status, 404); assert.equal(queued.size, 0); acceptOK = true;
  rows = [{ ...ride(), scheduledRide: false, pickupAt: new Date(now) }]; await accept(); assert.equal(queued.size, 0, "immediate ride safely no-ops");
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
  for (const state of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
    rows = [{ ...ride(40), status: state }]; assert.equal((await jobs.processScheduledRideJob(raceJob)).outcome, "NOOP");
  }
  rows = [{ ...ride(40), pickupAt: new Date(raceJob.data.pickupAtMs + minute) }]; assert.equal((await jobs.processScheduledRideJob(raceJob)).outcome, "STALE");
  rows = [{ ...ride(), pickupAt: new Date(now - 1) }]; assert.equal((await jobs.processScheduledRideJob({ name: "T15", data: { bookingId, pickupAtMs: +rows[0].pickupAt } })).outcome, "STALE");
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

  rows = [ride()]; actor.status = "ACTIVE";
  const calendar = (id = bookingId, authenticated = true) => calendarRoute.GET(request(`/api/driver/scheduled-rides/${id}/calendar`, "GET", undefined, authenticated), { params: Promise.resolve({ id }) });
  let response = await calendar(); assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8"); assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("content-disposition"), /^attachment; filename="drivo-ride-/);
  const content = await response.text(); assert.match(content, /DTSTART:.*Z\r\n/); assert.match(content, /UID:333333333333333333333333@drivo/); assert.doesNotMatch(content, /PRIVATE_|DTEND|DURATION/);
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
  console.log("Scheduled Driver runtime checks passed: acceptance, failures, 750-row reconciliation, ownership races, atomic delivery, readiness, calendar auth/privacy.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.Date = RealDate; });
