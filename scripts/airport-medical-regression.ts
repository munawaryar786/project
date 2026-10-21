import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AIRPORT_TRANSFER_PRESETS, airportTransferPresetsFor, canonicalAirportTransferAddress } from "../lib/airport-transfers";

assert.deepEqual(AIRPORT_TRANSFER_PRESETS.map((p) => p.code), ["BTS", "VIE", "BUD", "PRG"]);
for (const [search, code, country] of [
  ["Vienna International Airport", "VIE", "Austria"],
  ["Vienna Airport", "VIE", "Austria"],
  ["Budapest Ferenc Liszt International Airport", "BUD", "Hungary"],
  ["Budapest Airport", "BUD", "Hungary"],
  ["Prague Airport", "PRG", "Czechia"],
  ["Václav Havel Airport Prague", "PRG", "Czechia"],
] as const) {
  const result = airportTransferPresetsFor(search);
  assert.ok(result.some((airport) => airport.code === code && airport.description.includes(country)), search);
}
assert.equal(canonicalAirportTransferAddress("Vienna Airport", "airport").includes("Austria"), true);
assert.equal(canonicalAirportTransferAddress("Vienna Airport", "standard"), "Vienna Airport");
assert.deepEqual(airportTransferPresetsFor(""), []);
assert.deepEqual(airportTransferPresetsFor("xyznotanairport"), []);

const suggestionAPI = readFileSync("app/api/addresses/suggest/route.ts", "utf8");
const maps = readFileSync("lib/google-maps.ts", "utf8");
const addressUI = readFileSync("components/booking/AddressAutocomplete.tsx", "utf8");
const bookingUI = readFileSync("components/booking/BookingForm.tsx", "utf8");
const bookingSchema = readFileSync("lib/booking-schema.ts", "utf8");
const bookingService = readFileSync("lib/booking-creation-service.ts", "utf8");
const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");

assert.ok(suggestionAPI.includes('searchParams.get("service") === "airport"'));
assert.ok(maps.includes('components: "country:sk"'), "Slovak suggestions must stay scoped");
assert.ok(maps.includes("resolvedAirportSuggestions"), "airport preset geocode fallback expected");
assert.ok(maps.includes('expectedCountry'), "airport geocoding must validate country");
assert.ok(addressUI.includes('params.set("service", "airport")'));
assert.ok(bookingUI.includes('airportTransfer={serviceType === "airport"}'));
assert.ok(bookingUI.includes("returnTimingPreference"));
assert.ok(bookingUI.includes("Flexible / Call Driver When Ready"));
assert.ok(bookingUI.includes('setRideMode("schedule")'));
assert.ok(bookingSchema.includes('returnTimingPreference: z.enum(["FIXED", "FLEXIBLE"])'));
assert.ok(bookingService.includes("returnTimingPreference: data.returnTimingPreference"));
assert.ok(prismaSchema.includes("returnTimingPreference          String?"));
console.log("AIRPORT + MEDICAL REGRESSIONS: PASS (static/offline checks only)");
