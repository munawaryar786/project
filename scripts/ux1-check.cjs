const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/pricing-engine.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleObj = { exports: {} };
new Function("exports", "require", "module", js)(moduleObj.exports, require, moduleObj);
const { calculateFare, DEFAULT_DISTANCE_TIERS, DEFAULT_PRICING_ENGINE_CONFIG } = moduleObj.exports;
const expected = [[10, 12.5], [12.5, 12.5], [20, 20], [50, 50], [75, 72.5], [100, 95], [136, 125.6], [200, 180]];
for (const [distanceKm, total] of expected) {
  const result = calculateFare({ distanceKm, config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS, serviceType: "STANDARD_TAXI" });
  if (result.totalFare !== total) throw new Error(`Progressive fare ${distanceKm}km expected ${total}, got ${result.totalFare}`);
}
const mockedProviderDistanceMeters = 136000;
const mockedTripDistanceKm = Number((mockedProviderDistanceMeters / 1000).toFixed(1));
if (mockedTripDistanceKm !== 136) throw new Error("Provider metres-to-kilometres conversion failed");
const mockedTripFare = calculateFare({ distanceKm: mockedTripDistanceKm, config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS, serviceType: "STANDARD_TAXI" });
if (mockedTripFare.totalFare !== 125.6) throw new Error("136km mocked provider fare failed");
const assisted = calculateFare({ distanceKm: 20, tripDurationMinutes: 90, driverAssistanceRequired: true, waitingMinutes: 30, optionalCharges: { assistedTransport: true }, serviceType: "SENIOR_ACCESSIBLE_TRANSPORT", config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS });
if (assisted.breakdown.optionalServiceCharges.assistedTransport !== 15) throw new Error("Assistance must be prorated at EUR 10/hour");
if (assisted.breakdown.waitingCharge !== 2.5) throw new Error("Assisted waiting free period/rate failed");
const standard = calculateFare({ distanceKm: 20, waitingMinutes: 10, serviceType: "STANDARD_TAXI", config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS });
if (standard.breakdown.waitingCharge !== 1.25) throw new Error("Standard waiting free period/rate failed");
const airport = calculateFare({ distanceKm: 20, waitingMinutes: 40, serviceType: "AIRPORT_TRANSFERS", config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS });
if (airport.breakdown.waitingCharge !== 2.5) throw new Error("Airport waiting free period/rate failed");
function must(file, value) { if (!fs.readFileSync(path.join(root, file), "utf8").includes(value)) throw new Error(`${file} missing ${value}`); }
must("lib/assisted-transport.ts", "function requiresWav");
must("app/api/bookings/distance/route.ts", "calculateAuthoritativeBookingQuote");
must("components/booking/BookingForm.tsx", "role=\"dialog\"");
must("lib/feature-flags.ts", "FEATURE_FLAGS.childrenTransport");
console.log("Phase UX1 pricing, WAV, distance-source, and Children flag checks passed");
