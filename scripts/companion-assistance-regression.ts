import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateCompanionAssistanceCharge, COMPANION_ASSISTANCE_EUR_PER_HOUR } from "../lib/companion-assistance";
import { calculateFare } from "../lib/pricing-engine";

assert.equal(COMPANION_ASSISTANCE_EUR_PER_HOUR, 8);
for (const [count, hours, expected] of [[1,1,8],[1,3,24],[2,3,48],[3,3,72],[3,24,576]]) {
  assert.equal(calculateCompanionAssistanceCharge(count, hours), expected);
}
for (const [count, hours] of [[0,1],[1,0],[-1,3],[1,-2],[2,2.5],[4,1],[1,25]]) {
  assert.throws(() => calculateCompanionAssistanceCharge(count, hours), RangeError);
}
const normal = calculateFare({ distanceKm: 20, companionCount: 0, companionHours: 0 });
const added = calculateFare({ distanceKm: 20, companionCount: 2, companionHours: 3 });
assert.equal(added.breakdown.optionalServiceCharges.companionAssistance, 48);
assert.equal(added.totalFare - normal.totalFare, 48);
assert.equal(calculateFare({ distanceKm: 20 }).breakdown.optionalServiceCharges.companionAssistance, undefined);
for (const path of ["lib/booking-creation-service.ts", "lib/booking-quote.ts", "app/api/bookings/distance/route.ts", "components/booking/PriceEstimate.tsx", "components/booking/BookingForm.tsx", "lib/booking-schema.ts", "prisma/schema.prisma"]) {
  assert.ok(readFileSync(path, "utf8").includes("companionHours"), path);
}
console.log("COMPANION ASSISTANCE REGRESSIONS: PASS");
