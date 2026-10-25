const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed += 1;
  console.log("PASS", name);
}

check("checklist exists", exists("PHASE_3B_CHECKLIST.md"));
check("version audit exists", exists("PHASE_3B_VERSION_AUDIT.md"));
check("driver state helper exists", exists("lib/driver-state.ts"));
check("driver operations helper exists", exists("lib/driver-operations.ts"));
check("outbox helper exists", exists("lib/outbox.ts"));
check("presence route exists", exists("app/api/driver/presence/route.ts"));
check("heartbeat route exists", exists("app/api/driver/heartbeat/route.ts"));
check("active trip route exists", exists("app/api/driver/active-trip/route.ts"));
check("explicit command route exists", exists("app/api/driver/bookings/[id]/[command]/route.ts"));

const schema = read("prisma/schema.prisma");
check("driver stores client location time", schema.includes("lastLocationClientAt DateTime?"));
check("driver stores server location receipt", schema.includes("lastLocationReceivedAt DateTime?"));
check("driver stores location accuracy", schema.includes("lastLocationAccuracy Float?"));
check("driver stores heartbeat", schema.includes("lastHeartbeatAt DateTime?"));
check("offers have uniqueness guard", schema.includes("@@unique([bookingId, driverId])"));
check("outbox model exists", schema.includes("model OutboxEvent"));
check("outbox payload is structured", schema.includes("payload Json"));
check("outbox is pending by default", schema.includes('state String @default("PENDING")'));

const state = read("lib/driver-state.ts");
check("offline presence state", state.includes('"OFFLINE"'));
check("available presence state", state.includes('"AVAILABLE"'));
check("busy presence state", state.includes('"BUSY"'));
check("location readiness state", state.includes('"LOCATION_NOT_READY"'));
check("location freshness is centralized", state.includes("isLocationFresh"));
check("active trip policy is centralized", state.includes("ACTIVE_TRIP_STATUSES"));
check("arrival transition is explicit", state.includes('DRIVER_ENROUTE: ["ARRIVED"]'));
check("start requires arrival", state.includes('ARRIVED: ["IN_PROGRESS"]'));
check("completion transition exists", state.includes('IN_PROGRESS: ["COMPLETED"]'));

const availability = read("app/api/driver/availability/route.ts");
check("availability requires canonical driver auth", availability.includes("authorizeDriver"));
check("availability rejects body driver identity", availability.includes("z.object({ isOnline: z.boolean() }).strict()"));
check("availability returns presence state", availability.includes("getDriverPresence"));

const location = read("app/api/driver/location/route.ts");
check("location requires canonical driver auth", location.includes("authorizeDriver"));
check("location validates finite coordinates", location.includes(".finite().min(-90).max(90)"));
check("location records server receipt", location.includes("lastLocationReceivedAt: receivedAt"));
check("location does not accept driverId", !location.includes("driverId: z.string"));

const offers = read("app/api/driver/ride-requests/route.ts");
const dashboard = read("app/driver/dashboard/page.tsx");
check("offer list requires canonical driver auth", offers.includes("authorizeDriver"));
check("offer list expires stale offers", offers.includes("expireDriverOffers"));
check("offer list omits customer phone", !offers.includes("customerPhone"));
check("offer list omits child details", !offers.includes("childrenDetails"));
check("offer list omits medical notes", !offers.includes("medicalAppointment"));
check("offer list omits fare data", !offers.includes("estimatedPrice"));
check("offer list uses safe serialization", offers.includes("serializeOfferBooking"));
check("offer list omits exact coordinates", !offers.includes("pickupLat") && !offers.includes("dropoffLat"));
const incomingCard = dashboard.slice(dashboard.indexOf("function IncomingRideRequestCard"));
check("offer card omits exact addresses", !incomingCard.includes("request.booking?.pickupAddress") && !incomingCard.includes("request.booking?.dropoffAddress"));
check("offer card omits payment details", !incomingCard.includes("request.booking?.paymentMethod"));
check("offer list omits guardian fields", !offers.includes("guardianPhone"));

const response = read("app/api/driver/ride-requests/respond/route.ts");
check("offer response uses atomic service", response.includes("acceptDriverOfferAtomically"));
check("offer response has no driverId body field", !response.includes("driverId: z.string"));
check("offer response supports decline", response.includes('"DECLINE", "REJECT"'));

const operations = read("lib/driver-operations.ts");
check("acceptance uses transaction", operations.includes("$transaction"));
check("acceptance conditionally claims offer", operations.includes("claimedOffer"));
check("acceptance conditionally claims booking", operations.includes("claimedBooking"));
check("acceptance records outbox event", operations.includes("DRIVER_OFFER_ACCEPTED"));
check("conflict helper exists", operations.includes("findConflictingActiveTrip"));
check("completion derives busy from remaining trips", operations.includes("isOnTrip: Boolean(conflict)"));
check("completion expires pending offers", operations.includes('status: "EXPIRED"'));

const commands = read("app/api/driver/bookings/[id]/[command]/route.ts");
check("commands require canonical driver auth", commands.includes("authorizeDriver"));
check("commands are POST only", commands.includes("export async function POST"));
check("commands whitelist lifecycle", commands.includes('["enroute", "arrived", "start", "complete"]'));
check("commands reject invalid transition", commands.includes("INVALID_TRANSITION"));

const status = read("app/api/driver/status/route.ts");
check("generic status mutation is retired", status.includes("EXPLICIT_COMMAND_REQUIRED"));
check("generic status route does not update prisma", !status.includes("prisma.booking.update"));

check("dashboard has heartbeat", dashboard.includes("/api/driver/heartbeat"));
check("dashboard uses explicit command URL", dashboard.includes("/api/driver/bookings/"));
check("dashboard presents arrival action", dashboard.includes("nextStatus: \"ARRIVED\""));
check("dashboard retains children summary", dashboard.includes("ChildrenTransportSummary"));
check("dashboard retains assisted summary", dashboard.includes("AssistanceSummary"));

check("availability client retains PATCH contract", /"\/api\/driver\/availability", \{\s*method: "PATCH"/.test(dashboard));
check("dashboard includes shared active status policy", dashboard.includes("ACTIVE_TRIP_STATUSES as readonly string[]"));
console.log("Phase 3B checks passed: " + passed);
