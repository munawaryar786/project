import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateCompanionAssistanceCharge, COMPANION_ASSISTANCE_EUR_PER_HOUR, COMPANION_HOUR_OPTIONS, validCompanionHours } from "../lib/companion-assistance";
import { calculateFare } from "../lib/pricing-engine";

assert.equal(COMPANION_ASSISTANCE_EUR_PER_HOUR, 8);
for (const [count, hours, expected] of [[1,0.5,4],[1,1,8],[1,1.5,12],[2,0.5,8],[2,1.5,24],[1,3,24],[2,3,48],[3,3,72],[3,24,576]]) {
  assert.equal(calculateCompanionAssistanceCharge(count, hours), expected);
}
for (const [count, hours] of [[0,1],[1,0],[-1,3],[1,-2],[2,2.25],[2,0.75],[4,1],[1,25]]) {
  assert.throws(() => calculateCompanionAssistanceCharge(count, hours), RangeError);
}
assert.equal(COMPANION_HOUR_OPTIONS.length, 48);
assert.equal(COMPANION_HOUR_OPTIONS[0], 0.5);
assert.equal(COMPANION_HOUR_OPTIONS.at(-1), 24);
assert.equal(validCompanionHours(0.5), true);
assert.equal(validCompanionHours(1.5), true);
assert.equal(validCompanionHours(2.25), false);
const normal = calculateFare({ distanceKm: 20, companionCount: 0, companionHours: 0 });
const added = calculateFare({ distanceKm: 20, companionCount: 2, companionHours: 3 });
const halfHour = calculateFare({ distanceKm: 20, companionCount: 2, companionHours: 0.5 });
assert.equal(halfHour.breakdown.optionalServiceCharges.companionAssistance, 8);
assert.equal(added.breakdown.optionalServiceCharges.companionAssistance, 48);
assert.equal(added.totalFare - normal.totalFare, 48);
assert.equal(calculateFare({ distanceKm: 20 }).breakdown.optionalServiceCharges.companionAssistance, undefined);
for (const path of ["lib/booking-creation-service.ts", "lib/booking-quote.ts", "app/api/bookings/distance/route.ts", "components/booking/PriceEstimate.tsx", "components/booking/BookingForm.tsx", "lib/booking-schema.ts", "prisma/schema.prisma"]) {
  assert.ok(readFileSync(path, "utf8").includes("companionHours"), path);
}
console.log("COMPANION ASSISTANCE REGRESSIONS: PASS");
