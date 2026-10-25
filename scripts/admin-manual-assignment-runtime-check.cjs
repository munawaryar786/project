#!/usr/bin/env node
"use strict";
/*
 * Drivo Step 7D: isolated behavioral tests of the REAL assignAdminDriver
 * implementation in lib/admin-operations.ts, with a transactional fake DB.
 * No production MongoDB, network, notifications, email or external services.
 * Usage (from integration workspace):
 *   node scripts/admin-manual-assignment-runtime-check.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = process.cwd();
if (!fs.existsSync(path.join(root, "lib/admin-operations.ts"))) {
  throw new Error("Run from the Drivo integration-workspace root");
}
// Fail closed even if an accidentally imported module tries to access services.
process.env.DATABASE_URL = "mongodb://127.0.0.1:1/drivo_assignment_isolated_no_connection";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_ISOLATED_TEST"); };

const ADMIN = "aaaaaaaaaaaaaaaaaaaaaaaa";
const DRIVER_A = "111111111111111111111111";
const DRIVER_B = "222222222222222222222222";
const BOOKING_A = "333333333333333333333333";
const BOOKING_B = "444444444444444444444444";
const PASSENGER = "555555555555555555555555";
const OFFER_A = "666666666666666666666666";
const OFFER_B = "777777777777777777777777";
let state;
let revision = 0;
let failAt = null;
let idCounter = 0;
let scheduledFeasible = true;
let scheduledCalls = 0;
let passes = 0;
let raceBarrier = null;
function fixtureBooking(id = BOOKING_A) {
  return {
    id, bookingRef: "TEST-" + id.slice(0, 5), driverId: null,
    status: "CONFIRMED", dispatchStatus: "NOT_STARTED", bookingSource: "WEB",
    serviceType: "STANDARD", passengerCount: 2, companionCount: 0,
    luggageType: "NONE", smallBags: 0, largeBags: 0, wavRequired: false,
    paymentMethod: "CASH", cashAgreed: true,
    passengerId: PASSENGER, passengerAuthStatus: "AUTHENTICATED", phoneVerified: true,
    pickupLat: 48.15, pickupLng: 17.11, dropoffLat: 48.2, dropoffLng: 17.2,
    fareTotalFare: 20, estimatedPrice: 20, scheduledRide: false,
    scheduledDate: "2026-11-01", scheduledTime: "12:00", languagePref: "slovak",
    customerPhone: "private", customerName: "Private Person"
  };
}
function fixtureDriver(id, type = "STANDARD", cap = 6) {
  return {
    id, fullName: "Fake Driver", status: "ACTIVE", isOnTrip: false,
    isOnline: false, vehicleType: type, vehicleCapacity: cap,
    vehicle: { type, maxPassengers: cap, wheelchairAccessible: type === "WAV", status: "ACTIVE" },
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}
function reset() {
  revision = 0; failAt = null; idCounter = 0; scheduledFeasible = true;
  scheduledCalls = 0; raceBarrier = null;
  state = {
    adminUser: [{ id: ADMIN, role: "SUPER_ADMIN" }],
    booking: [fixtureBooking()],
    driver: [fixtureDriver(DRIVER_A), fixtureDriver(DRIVER_B)],
    rideRequest: [
      { id: OFFER_A, bookingId: BOOKING_A, driverId: DRIVER_A, status: "PENDING" },
      { id: OFFER_B, bookingId: BOOKING_A, driverId: DRIVER_B, status: "PENDING" }
    ],
    adminAuditEvent: [], outboxEvent: [], bookingPayment: [], paymentWebhookEvent: []
  };
}
function matches(row, where = {}) {
  if (!row) return false;
  return Object.entries(where || {}).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every(w => matches(row, w));
    if (key === "OR") return expected.some(w => matches(row, w));
    if (key === "NOT") return !matches(row, expected);
    const actual = row[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date) && !Array.isArray(expected)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === "in") return value.includes(actual);
        if (operator === "notIn") return !value.includes(actual);
        if (operator === "not") return actual !== value;
        if (operator === "isSet") return (actual !== undefined) === value;
        if (operator === "equals") return actual === value;
        if (operator === "gt") return actual > value;
        if (operator === "gte") return actual >= value;
        if (operator === "lt") return actual < value;
        if (operator === "lte") return actual <= value;
        throw new Error("UNIMPLEMENTED_FAKE_FILTER:" + operator);
      });
    }
    return expected instanceof Date ? Number(actual) === Number(expected) : actual === expected;
  });
}
function project(row, args = {}, data = state, model = "") {
  if (!row) return null;
  const result = structuredClone(row);
  if (args.include?.driver && model === "booking") {
    result.driver = structuredClone(data.driver.find(d => d.id === row.driverId) || null);
  }
  // The test drivers carry their linked vehicle as an embedded fake relation.
  if (args.select) {
    return Object.fromEntries(Object.keys(args.select).filter(k => args.select[k]).map(k => [k, result[k] ?? null]));
  }
  return result;
}
function fakeDB(data, markWrite = () => {}) {
  const db = {};
  for (const model of Object.keys(data)) {
    db[model] = {
      findUnique: async args => project(data[model].find(r => matches(r, args.where)), args, data, model),
      findFirst: async args => project(data[model].find(r => matches(r, args.where)), args, data, model),
      findMany: async (args = {}) => data[model].filter(r => matches(r, args.where || {})).map(r => project(r, args, data, model)),
      updateMany: async ({ where, data: changes }) => {
        if (failAt === model + ".updateMany") throw Error("injected " + failAt);
        if (model === "driver" && raceBarrier) {
          raceBarrier.count += 1;
          if (raceBarrier.count === 2) raceBarrier.release();
          await raceBarrier.promise;
        }
        const rows = data[model].filter(r => matches(r, where));
        if (rows.length) markWrite();
        for (const row of rows) Object.assign(row, structuredClone(changes));
        return { count: rows.length };
      },
      create: async ({ data: newRow }) => {
        if (failAt === model + ".create") throw Error("injected " + failAt);
        if (model === "adminAuditEvent" && data[model].some(x => x.requestId === newRow.requestId)) {
          throw Object.assign(Error("Duplicate requestId"), { code: "P2002" });
        }
        if (model === "outboxEvent" && data[model].some(x => x.idempotencyKey === newRow.idempotencyKey)) {
          throw Object.assign(Error("Duplicate outbox idempotency key"), { code: "P2002" });
        }
        markWrite();
        const row = { id: "fake-" + (++idCounter), ...structuredClone(newRow) };
        data[model].push(row);
        return structuredClone(row);
      },
    };
  }
  return db;
}
const prisma = new Proxy({}, {
  get(_target, property) {
    if (property === "$transaction") return async fn => {
      if (failAt === "transactions") throw Object.assign(Error("Replica set unavailable"), { code: "P2031" });
      const before = revision;
      const snapshot = structuredClone(state);
      let wrote = false;
      const outcome = await fn(fakeDB(snapshot, () => { wrote = true; }));
      if (wrote && revision !== before) throw Object.assign(Error("Write conflict"), { code: "P2034" });
      if (wrote) { state = snapshot; revision += 1; }
      return outcome;
    };
    return fakeDB(state, () => { revision += 1; })[property];
  }
});
const mocks = {
  "@/lib/prisma": { prisma },
  "@/lib/automatic-dispatch": {
    startAutomaticDispatch: async () => ({ ok: true }),
    startScheduledRecoveryDispatch: async () => ({ ok: true })
  },
  "@/lib/security/authorization": {
    hasBookingOperationsPermission: role => role === "SUPER_ADMIN" || role === "ADMIN"
  },
  "@/lib/driver-state": {
    evaluateDriverPresence: () => ({ presenceState: "OFFLINE" }),
    isLocationFresh: () => true,
    ACTIVE_TRIP_STATUSES: ["ASSIGNED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS"]
  },
  "@/lib/scheduled-marketplace": {
    SCHEDULED_MARKET_CONFIG: { locationMaxAgeSeconds: 120 },
    bookingPickupAt: booking => booking.pickupAt || null,
    scheduledDriverCompatibility: () => ({ eligible: scheduledFeasible, code: "DRIVER_SCHEDULE_CONFLICT" }),
    assertScheduledRouteFeasible: async () => {
      scheduledCalls++;
      if (!scheduledFeasible) throw Error("DRIVER_SCHEDULE_CONFLICT");
    },
    releaseScheduledAssignment: async () => ({ ok: true })
  },
  "@/lib/outbox": {
    writeOutboxEvent: async (tx, data) => tx.outboxEvent.create({ data })
  },
  "@/lib/email/domain": {
    writeBookingAssignedEmail: async (tx, bookingId, driverId) => {
      if (failAt === "email") throw Error("Injected email failure");
      return tx.outboxEvent.create({ data: {
        eventType: "BOOKING_EMAIL_ASSIGNED", bookingId, driverId,
        idempotencyKey: "email:booking-assigned:" + bookingId + ":" + driverId
      }});
    }
  }
};
const cache = new Map();
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  if (!fs.existsSync(full)) throw new Error("Missing real service source: " + full);
  const moduleObject = new Module(full, module);
  moduleObject.filename = full;
  moduleObject.paths = Module._nodeModulePaths(path.dirname(full));
  cache.set(full, moduleObject);
  moduleObject.require = name => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const candidate = path.join(root, name.slice(2));
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        if (fs.existsSync(candidate + suffix)) return load(candidate + suffix);
      }
      throw new Error("Unmocked alias dependency: " + name);
    }
    if (name.startsWith(".")) {
      const candidate = path.resolve(path.dirname(full), name);
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        if (fs.existsSync(candidate + suffix)) return load(candidate + suffix);
      }
    }
    return Module.prototype.require.call(moduleObject, name);
  };
  moduleObject._compile(ts.transpileModule(fs.readFileSync(full, "utf8"), {
    fileName: full,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, full);
  return moduleObject.exports;
}
const { assignAdminDriver } = load("lib/admin-operations.ts");
assert.equal(typeof assignAdminDriver, "function", "Actual assignAdminDriver export is required");
const request = (driverId = DRIVER_A, id = BOOKING_A, requestId = "test-request-0001") => ({
  bookingId: id, driverId, requestId, reason: "Verified dispatcher assignment"
});
async function check(label, test) {
  reset();
  await test();
  passes++;
  console.log("PASS manual assignment:", label);
}
function events() { return state.outboxEvent.map(x => x.eventType).sort(); }
function assertUnchanged(before) { assert.deepEqual(state, before, "Rejected operation must not mutate state"); }
(async () => {
  await check("success commits one assigned booking, claimed driver, cancels offers, emits events and audit", async () => {
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, true);
    assert.equal(result.replayed, false);
    assert.equal(state.booking[0].driverId, DRIVER_A);
    assert.equal(state.booking[0].status, "ASSIGNED");
    assert.equal(state.booking[0].dispatchStatus, "ACCEPTED");
    assert.equal(state.booking[0].acceptedAt instanceof Date, true);
    assert.equal(state.driver[0].isOnTrip, true);
    assert.equal(state.rideRequest.every(x => x.status === "CANCELLED"), true);
    assert.deepEqual(events(), ["ADMIN_MANUAL_ASSIGNMENT", "ADMIN_OFFER_CANCELLED", "ADMIN_OFFER_CANCELLED", "BOOKING_EMAIL_ASSIGNED"].sort());
    assert.equal(state.adminAuditEvent.length, 1);
    assert.equal(state.adminAuditEvent[0].action, "MANUAL_ASSIGNMENT");
    assert.equal(state.adminAuditEvent[0].reason, request().reason);
  });
  await check("legacy booking with missing driverId is still assignable", async () => {
    delete state.booking[0].driverId;
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, true);
    assert.equal(state.booking[0].driverId, DRIVER_A);
  });
  await check("unknown booking returns NOT_FOUND without mutations", async () => {
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(DRIVER_A, BOOKING_B), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "BOOKING_NOT_FOUND");
    assertUnchanged(before);
  });
  await check("unknown driver returns eligibility failure without mutations", async () => {
    const before = structuredClone(state);
    const result = await assignAdminDriver(request("999999999999999999999999"), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "DRIVER_INELIGIBLE");
    assertUnchanged(before);
  });
  await check("idempotent replay returns success without second audit or event", async () => {
    const one = await assignAdminDriver(request(), ADMIN);
    assert.equal(one.ok, true);
    const before = structuredClone(state);
    const two = await assignAdminDriver(request(), ADMIN);
    assert.equal(two.ok, true);
    assert.equal(two.replayed, true);
    assertUnchanged(before);
  });
  await check("requestId cannot be replayed for another driver", async () => {
    assert.equal((await assignAdminDriver(request(), ADMIN)).ok, true);
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(DRIVER_B), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_REQUEST");
    assertUnchanged(before);
  });
  await check("already-assigned same driver is idempotent", async () => {
    assert.equal((await assignAdminDriver(request(), ADMIN)).ok, true);
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(DRIVER_A, BOOKING_A, "test-request-0002"), ADMIN);
    assert.equal(result.ok, true);
    assert.equal(result.outcome, "ALREADY_ASSIGNED");
    assertUnchanged(before);
  });
  await check("different driver cannot take already-assigned booking", async () => {
    assert.equal((await assignAdminDriver(request(), ADMIN)).ok, true);
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(DRIVER_B, BOOKING_A, "test-request-0002"), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "BOOKING_ALREADY_ASSIGNED");
    assertUnchanged(before);
  });
  await check("unauthorized administrator role rejected", async () => {
    state.adminUser[0].role = "VIEWER";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "INSUFFICIENT_PERMISSIONS");
    assertUnchanged(before);
  });
  await check("booking lacking verified passenger rejected", async () => {
    state.booking[0].phoneVerified = false;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "PASSENGER_VERIFICATION_REQUIRED");
    assertUnchanged(before);
  });
  await check("unconfirmed CARD payment rejected", async () => {
    state.booking[0].paymentMethod = "CARD";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "PAYMENT_NOT_CONFIRMED");
    assertUnchanged(before);
  });
  await check("paid CARD booking with authoritative receipt can be assigned", async () => {
    state.booking[0].paymentMethod = "CARD";
    state.bookingPayment.push({ id: "payment1", bookingId: BOOKING_A, provider: "STRIPE", paymentMethod: "CARD", status: "PAID", currency: "EUR", amountMinor: 2000 });
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, true);
  });
  await check("PHONE_DISPATCH must have the creating dispatcher identity", async () => {
    state.booking[0].bookingSource = "PHONE_DISPATCH";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "BOOKING_AUTHORIZATION_REQUIRED");
    assertUnchanged(before);
  });
  await check("CASH without consent rejected", async () => {
    state.booking[0].cashAgreed = false;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CASH_AGREEMENT_REQUIRED");
    assertUnchanged(before);
  });
  await check("missing destination coordinates rejected", async () => {
    state.booking[0].dropoffLat = null;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "NO_PICKUP_COORDINATES");
    assertUnchanged(before);
  });
  await check("completed booking rejected", async () => {
    state.booking[0].status = "COMPLETED";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "BOOKING_NOT_ASSIGNABLE");
    assertUnchanged(before);
  });
  await check("inactive driver rejected", async () => {
    state.driver[0].status = "SUSPENDED";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "DRIVER_INELIGIBLE");
    assertUnchanged(before);
  });
  await check("busy driver rejected", async () => {
    state.driver[0].isOnTrip = true;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "DRIVER_BUSY");
    assertUnchanged(before);
  });
  await check("driver with active booking rejected even if stale isOnTrip flag is false", async () => {
    state.booking.push({ ...fixtureBooking(BOOKING_B), driverId: DRIVER_A, status: "IN_PROGRESS" });
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "DRIVER_INELIGIBLE");
    assertUnchanged(before);
  });
  await check("excess passenger capacity rejected", async () => {
    state.driver[0].vehicle.maxPassengers = 4;
    state.booking[0].passengerCount = 5;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CAPACITY_EXCEEDED");
    assertUnchanged(before);
  });
  await check("luggage incompatibility rejected", async () => {
    state.booking[0].passengerCount = 5;
    state.booking[0].smallBags = 1;
    state.booking[0].luggageType = "SMALL";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "LUGGAGE_INCOMPATIBLE");
    assertUnchanged(before);
  });
  await check("WAV-required booking rejected for ordinary vehicle", async () => {
    state.booking[0].serviceType = "ACCESSIBLE";
    state.booking[0].wavRequired = true;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "WAV_REQUIRED");
    assertUnchanged(before);
  });
  await check("driver claim failure rolls back booking and audit", async () => {
    failAt = "driver.updateMany";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("booking CAS failure rolls back claimed driver", async () => {
    failAt = "booking.updateMany";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("outbox creation failure rolls back driver and booking", async () => {
    failAt = "outboxEvent.create";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("assignment email-intent failure rolls back entire transaction", async () => {
    failAt = "email";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("audit creation failure rolls back entire transaction", async () => {
    failAt = "adminAuditEvent.create";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("unavailable Mongo transaction returns conflict with no changes", async () => {
    failAt = "transactions";
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "STATE_CONFLICT");
    assertUnchanged(before);
  });
  await check("scheduled booking claims reservation without marking current trip busy", async () => {
    state.booking[0].scheduledRide = true;
    state.booking[0].pickupAt = new Date(Date.now() + 3 * 86400000);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, true);
    assert.equal(state.driver[0].isOnTrip, false);
    assert.equal(state.booking[0].status, "ASSIGNED");
    assert(scheduledCalls >= 2);
  });
  await check("scheduled route incompatibility rejects safely", async () => {
    state.booking[0].scheduledRide = true;
    state.booking[0].pickupAt = new Date(Date.now() + 3 * 86400000);
    scheduledFeasible = false;
    const before = structuredClone(state);
    const result = await assignAdminDriver(request(), ADMIN);
    assert.equal(result.ok, false);
    assert.equal(result.code, "DRIVER_SCHEDULE_CONFLICT");
    assertUnchanged(before);
  });
  await check("simultaneous assignments to one booking allow exactly one winner", async () => {
    let release;
    let timer;
    const promise = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Concurrent test barrier timed out")), 5000);
      release = () => { clearTimeout(timer); resolve(); };
    });
    raceBarrier = { promise, release, count: 0 };
    const [first, second] = await Promise.all([
      assignAdminDriver(request(DRIVER_A, BOOKING_A, "test-concurrent-0001"), ADMIN),
      assignAdminDriver(request(DRIVER_B, BOOKING_A, "test-concurrent-0002"), ADMIN)
    ]);
    assert.equal([first, second].filter(r => r.ok).length, 1);
    assert.equal(state.adminAuditEvent.length, 1);
    assert.equal(state.outboxEvent.filter(e => e.eventType === "ADMIN_MANUAL_ASSIGNMENT").length, 1);
    assert([DRIVER_A, DRIVER_B].includes(state.booking[0].driverId));
  });
  console.log(`Admin manual assignment isolated behavioral tests passed: ${passes} (fake transactional DB; no real Mongo/browser/network)`);
})().catch(error => {
  console.error("FAIL manual assignment isolated test:", error.stack || error);
  process.exitCode = 1;
}).finally(() => { globalThis.fetch = originalFetch; });
