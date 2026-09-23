const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/pricing-engine.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleObj = { exports: {} };
new Function("exports", "require", "module", js)(moduleObj.exports, require, moduleObj);
const { calculateFare, DEFAULT_DISTANCE_TIERS, DEFAULT_PRICING_ENGINE_CONFIG } = moduleObj.exports;
const expected = [[10, 12.5], [12.5, 12.5], [20, 20], [50, 50], [75, 72.5], [100, 95], [101, 95.85], [136, 125.6], [200, 180]];
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
for (const serviceType of ["ACCESSIBLE", "SENIOR_ACCESSIBLE_TRANSPORT"]) {
  const freeWait = calculateFare({ distanceKm: 20, waitingMinutes: 15, serviceType });
  const operationalWait = calculateFare({ distanceKm: 20, waitingMinutes: 30, serviceType });
  if (freeWait.breakdown.waitingCharge !== 0) throw new Error(`${serviceType} operational free 15 minutes failed`);
  if (operationalWait.breakdown.waitingCharge !== 2.5) throw new Error(`${serviceType} operational waiting rate changed`);
}
const standard = calculateFare({ distanceKm: 20, waitingMinutes: 10, serviceType: "STANDARD_TAXI", config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS });
if (standard.breakdown.waitingCharge !== 1.25) throw new Error("Standard waiting free period/rate failed");
if (calculateFare({ distanceKm: 20, waitingMinutes: 5, serviceType: "STANDARD_TAXI" }).breakdown.waitingCharge !== 0) throw new Error("Standard operational free 5 minutes changed");
const airport = calculateFare({ distanceKm: 20, waitingMinutes: 40, serviceType: "AIRPORT_TRANSFERS", config: DEFAULT_PRICING_ENGINE_CONFIG, distanceTiers: DEFAULT_DISTANCE_TIERS });
if (airport.breakdown.waitingCharge !== 2.5) throw new Error("Airport waiting free period/rate failed");
if (calculateFare({ distanceKm: 20, waitingMinutes: 30, serviceType: "AIRPORT_TRANSFERS" }).breakdown.waitingCharge !== 0) throw new Error("Airport operational free 30 minutes changed");

const reservedMinutes = [[0, 0], [30, 5], [45, 7.5], [60, 10], [90, 15], [120, 20], [180, 30], [240, 40]];
for (const [waitingMinutes, expectedCharge] of reservedMinutes) {
  const result = calculateFare({
    distanceKm: 20,
    waitingMinutes,
    reservedWaiting: waitingMinutes > 0,
    serviceType: "SENIOR_ACCESSIBLE_TRANSPORT",
    config: { ...DEFAULT_PRICING_ENGINE_CONFIG, waitingRatePerMinute: 9.99 },
  });
  if (result.breakdown.waitingCharge !== expectedCharge) {
    throw new Error(`Reserved waiting ${waitingMinutes}m expected EUR ${expectedCharge.toFixed(2)}, got EUR ${result.breakdown.waitingCharge.toFixed(2)}`);
  }
}
const noReservedWait = calculateFare({ distanceKm: 20, waitingMinutes: 0, reservedWaiting: false });
const oneReservedWait = calculateFare({ distanceKm: 20, waitingMinutes: 30, reservedWaiting: true });
if (oneReservedWait.totalFare - noReservedWait.totalFare !== oneReservedWait.breakdown.waitingCharge) {
  throw new Error("Reserved waiting was added more than once");
}

function fareForAssistanceLevel(assistanceLevel, tripDurationMinutes, waitingMinutes = 0, reservedWaiting = false) {
  return calculateFare({
    distanceKm: 20,
    tripDurationMinutes,
    waitingMinutes,
    reservedWaiting,
    assistanceLevel,
    driverAssistanceRequired: Boolean(assistanceLevel),
    optionalCharges: { assistedTransport: true },
    serviceType: "SENIOR_ACCESSIBLE_TRANSPORT",
    config: { ...DEFAULT_PRICING_ENGINE_CONFIG, assistedTransportFee: 99 },
  });
}
const lightAssistance = fareForAssistanceLevel("LIGHT", 60);
if (lightAssistance.breakdown.optionalServiceCharges.assistedTransport !== undefined) {
  throw new Error("LIGHT assistance must not add a Driver Assistance fee");
}
for (const tripDurationMinutes of [10, 60, 120]) {
  const doorToDoor = fareForAssistanceLevel("DOOR_TO_DOOR", tripDurationMinutes);
  if (doorToDoor.breakdown.optionalServiceCharges.assistedTransport !== 2.5) {
    throw new Error(`DOOR_TO_DOOR fee changed with ${tripDurationMinutes}-minute trip`);
  }
}
const boardingHelp = fareForAssistanceLevel("BOARDING_HELP", 60);
if (boardingHelp.breakdown.optionalServiceCharges.assistedTransport !== 2.5) {
  throw new Error("BOARDING_HELP must charge a flat EUR 2.50");
}
const doorWith30MinuteWait = fareForAssistanceLevel("DOOR_TO_DOOR", 10, 30, true);
if (doorWith30MinuteWait.breakdown.optionalServiceCharges.assistedTransport !== 2.5 || doorWith30MinuteWait.breakdown.waitingCharge !== 5) {
  throw new Error("DOOR_TO_DOOR plus 30-minute reserved waiting fees are not independent");
}
const boardingWith60MinuteWait = fareForAssistanceLevel("BOARDING_HELP", 120, 60, true);
if (boardingWith60MinuteWait.breakdown.optionalServiceCharges.assistedTransport !== 2.5 || boardingWith60MinuteWait.breakdown.waitingCharge !== 10) {
  throw new Error("BOARDING_HELP plus 60-minute reserved waiting fees are not independent");
}
const noAssistanceWithWait = calculateFare({ distanceKm: 20, waitingMinutes: 30, reservedWaiting: true, serviceType: "SENIOR_ACCESSIBLE_TRANSPORT" });
if (doorWith30MinuteWait.totalFare - noAssistanceWithWait.totalFare !== 2.5) {
  throw new Error("Driver Assistance fee was not added exactly once");
}

const quoteSource = fs.readFileSync(path.join(root, "lib/booking-quote.ts"), "utf8");
if (!quoteSource.includes("reservedWaiting: waitingMinutes > 0")) throw new Error("Authoritative quote does not mark selected waiting as reserved");
if (!quoteSource.includes("assistanceLevel: input.assistanceLevel")) throw new Error("Authoritative quote does not pass explicit assistance level to the pricing engine");
if (!fs.readFileSync(path.join(root, "components/booking/PriceEstimate.tsx"), "utf8").includes("waitingMinutes,")) throw new Error("Frontend estimate no longer sends selected waiting minutes");
if (!fs.readFileSync(path.join(root, "app/api/bookings/distance/route.ts"), "utf8").includes("waitingMinutes: data.waitingMinutes")) throw new Error("Estimate route does not pass selected waiting minutes to authoritative quote");
const bookingServiceSource = fs.readFileSync(path.join(root, "lib/booking-creation-service.ts"), "utf8");
if (!/waitingMinutes:\s*data\.waitingDuration\s*===/.test(bookingServiceSource)) throw new Error("Shared booking service does not pass selected waiting minutes to authoritative quote");
const distanceRouteSource = fs.readFileSync(path.join(root, "app/api/bookings/distance/route.ts"), "utf8");
if (!distanceRouteSource.includes('assistanceLevel: z.enum(["LIGHT", "DOOR_TO_DOOR", "BOARDING_HELP"]).optional().nullable()')) throw new Error("Estimate route assistance-level schema does not match booking flow");
if (!distanceRouteSource.includes("assistanceLevel: data.assistanceLevel")) throw new Error("Estimate route does not forward assistance level unchanged");
const estimateComponentSource = fs.readFileSync(path.join(root, "components/booking/PriceEstimate.tsx"), "utf8");
if (!estimateComponentSource.includes('assistedTransport: "Driver Assistance"') || !estimateComponentSource.includes('label="Additional Services"') || !estimateComponentSource.includes("optionalServices.map")) {
  throw new Error("PriceEstimate no longer displays assistedTransport under Additional Services");
}
function must(file, value) { if (!fs.readFileSync(path.join(root, file), "utf8").includes(value)) throw new Error(`${file} missing ${value}`); }
must("lib/assisted-transport.ts", "function requiresWav");
must("app/api/bookings/distance/route.ts", "calculateAuthoritativeBookingQuote");
must("lib/booking-creation-service.ts", "calculateAuthoritativeBookingQuote({");
must("components/booking/BookingForm.tsx", "role=\"dialog\"");
must("lib/feature-flags.ts", "FEATURE_FLAGS.childrenTransport");

async function verifyAuthoritativeWaitingQuote() {
  const quoteSource = fs.readFileSync(path.join(root, "lib/booking-quote.ts"), "utf8");
  const quoteJs = ts.transpileModule(quoteSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const quoteModule = { exports: {} };
  const quoteRequire = (id) => {
    if (id === "@/lib/google-maps") {
      return { calculateDistance: async () => ({ distanceKm: 20, durationMinutes: 90, origin: "A", destination: "B" }) };
    }
    if (id === "@/lib/pricing-engine-config") {
      return {
        getPricingEngineConfig: async () => ({
          config: { ...DEFAULT_PRICING_ENGINE_CONFIG, waitingRatePerMinute: 9.99, assistedTransportFee: 99 },
          distanceTiers: DEFAULT_DISTANCE_TIERS,
        }),
      };
    }
    if (id === "@/lib/pricing-engine") return moduleObj.exports;
    return require(id);
  };
  new Function("exports", "require", "module", quoteJs)(quoteModule.exports, quoteRequire, quoteModule);
  const calculateQuote = quoteModule.exports.calculateAuthoritativeBookingQuote;
  const estimatedQuote = await calculateQuote({ pickupAddress: "A", dropoffAddress: "B", serviceType: "accessible", assistanceLevel: "DOOR_TO_DOOR", waitingMinutes: 30 });
  const bookingQuote = await calculateQuote({ pickupAddress: "A", dropoffAddress: "B", serviceType: "accessible", assistanceLevel: "DOOR_TO_DOOR", waitingDuration: "30_MINUTES", waitingMinutes: 30 });
  const boardingQuote = await calculateQuote({ pickupAddress: "A", dropoffAddress: "B", serviceType: "accessible", assistanceLevel: "BOARDING_HELP", waitingDuration: "1_HOUR", waitingMinutes: 60 });
  const lightQuote = await calculateQuote({ pickupAddress: "A", dropoffAddress: "B", serviceType: "accessible", assistanceLevel: "LIGHT", waitingMinutes: 0 });
  const noWaitQuote = await calculateQuote({ pickupAddress: "A", dropoffAddress: "B", serviceType: "accessible", waitingMinutes: 0 });
  if (estimatedQuote.breakdown.waitingCharge !== 5 || bookingQuote.breakdown.waitingCharge !== 5 || estimatedQuote.breakdown.optionalServiceCharges.assistedTransport !== 2.5 || bookingQuote.breakdown.optionalServiceCharges.assistedTransport !== 2.5 || estimatedQuote.breakdown.totalFare !== bookingQuote.breakdown.totalFare) {
    throw new Error("Estimate and booking quote must match for DOOR_TO_DOOR plus 30m reserved waiting");
  }
  if (boardingQuote.breakdown.waitingCharge !== 10 || boardingQuote.breakdown.optionalServiceCharges.assistedTransport !== 2.5) throw new Error("BOARDING_HELP plus 60m reserved waiting quote failed");
  if (lightQuote.breakdown.optionalServiceCharges.assistedTransport !== undefined) throw new Error("LIGHT assistance quote must not include a fee");
  if (noWaitQuote.breakdown.waitingCharge !== 0) throw new Error("No selected waiting must not add reserved waiting charge");
}

verifyAuthoritativeWaitingQuote()
  .then(() => console.log("Phase UX1 pricing, reserved waiting, quote parity, WAV, distance-source, and Children flag checks passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
