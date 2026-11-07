"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync("lib/booking-capacity.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
new Function("exports", "module", compiled)(mod.exports, mod);
const check = mod.exports.standardVehicleCapacityIssue;
const scenarios = [
  [{ passengerCount: 6, smallBags: 0, largeBags: 0 }, null],
  [{ passengerCount: 5, smallBags: 1, largeBags: 0 }, null],
  [{ passengerCount: 5, companionCount: 1, largeBags: 1 }, "LUGGAGE_CAPACITY_EXCEEDED"],
  [{ passengerCount: 6, smallBags: 1 }, "LUGGAGE_CAPACITY_EXCEEDED"],
  [{ passengerCount: 6, largeBags: 1 }, "LUGGAGE_CAPACITY_EXCEEDED"],
  [{ passengerCount: 6, luggageType: "SMALL" }, "LUGGAGE_CAPACITY_EXCEEDED"],
  [{ passengerCount: 6, luggageType: "LARGE" }, "LUGGAGE_CAPACITY_EXCEEDED"],
  [{ passengerCount: 6, luggageType: "NONE" }, null],
  [{ passengerCount: 7 }, "CAPACITY_EXCEEDED"],
  [{ passengerCount: 5, companionCount: 2 }, "CAPACITY_EXCEEDED"],
  [{ passengerCount: 0 }, "CAPACITY_EXCEEDED"],
  [{ passengerCount: 2.5 }, "CAPACITY_EXCEEDED"],
  [{ passengerCount: 2, smallBags: -1 }, "CAPACITY_EXCEEDED"],
];
for (const [input, expected] of scenarios) assert.equal(check(input), expected, JSON.stringify(input));
for (const file of ["lib/booking-creation-service.ts", "lib/booking-eligibility.ts", "lib/saved-routes.ts"]) {
  const source = fs.readFileSync(file, "utf8");
  assert.ok(source.includes("standardVehicleCapacityIssue("), file + " must apply shared capacity policy");
}
console.log("Drivo shared vehicle capacity checks passed (" + scenarios.length + " scenarios and 3 call sites).");
