"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const file = fs.readFileSync("lib/booking-market-clock.ts", "utf8");
const compiled = ts.transpileModule(file, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
new Function("require", "exports", "module", compiled)(
  (id) => {
    if (id === "./i18n/locale-resolution") return { MARKET_TIME_ZONE: "Europe/Bratislava" };
    throw new Error("Unexpected import: " + id);
  },
  moduleRef.exports,
  moduleRef
);
const { currentBookingMarketWallTime } = moduleRef.exports;
for (const [iso, date, time] of [
  ["2026-01-15T23:15:00.000Z", "2026-01-16", "00:15"],
  ["2026-07-15T22:15:00.000Z", "2026-07-16", "00:15"],
  ["2026-03-29T00:30:00.000Z", "2026-03-29", "01:30"],
  ["2026-03-29T01:30:00.000Z", "2026-03-29", "03:30"],
  ["2026-10-25T00:30:00.000Z", "2026-10-25", "02:30"],
  ["2026-10-25T01:30:00.000Z", "2026-10-25", "02:30"],
]) {
  assert.deepEqual(currentBookingMarketWallTime(new Date(iso)), { date, time }, "Bratislava wall time: " + iso);
}
assert.throws(() => currentBookingMarketWallTime(new Date(NaN)), /Invalid booking clock/);
const form = fs.readFileSync("components/booking/BookingForm.tsx", "utf8");
assert.ok(form.includes("currentBookingMarketWallTime()") && form.includes("const today = marketNow.date;"));
assert.ok(form.includes("scheduledDate : rideNowAtSubmit.date") && form.includes("scheduledTime : rideNowAtSubmit.time"));
assert.ok(!form.includes('new Date().toISOString().split("T")[0]'));
assert.ok(!form.includes('new Date().toTimeString().slice(0, 5)'));
console.log("Market clock timezone checks passed (winter/summer, midnight and DST transitions).");
