import assert from "node:assert/strict";
import { bookingPickupIsExpired, marketLocalDateTime } from "../lib/market-booking-time";

assert.deepEqual(marketLocalDateTime(new Date("2026-01-15T23:10:00.000Z")), { date: "2026-01-16", time: "00:10" });
assert.deepEqual(marketLocalDateTime(new Date("2026-07-15T22:30:00.000Z")), { date: "2026-07-16", time: "00:30" });
assert.deepEqual(marketLocalDateTime(new Date("2026-10-21T04:31:31.000Z")), { date: "2026-10-21", time: "06:31" });
const now = new Date("2026-10-21T04:31:31.000Z");
assert.equal(bookingPickupIsExpired(new Date("2026-10-12T22:21:00.000Z"), now), true);
assert.equal(bookingPickupIsExpired(new Date(now.getTime() - 60_000), now, true), true);
assert.equal(bookingPickupIsExpired(new Date(now.getTime() + 60_000), now, true), false);
assert.equal(bookingPickupIsExpired(new Date(now.getTime() - 60_000), now), false);
assert.equal(bookingPickupIsExpired(new Date(now.getTime() - 180_000), now), true);
assert.equal(bookingPickupIsExpired(new Date("invalid"), now), true);
console.log("BOOKING TIME REGRESSION TESTS: PASS");
