"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const form = fs.readFileSync("components/booking/BookingForm.tsx", "utf8");
const api = fs.readFileSync("app/api/passenger/invoice-eligibility/route.ts", "utf8");
const booking = fs.readFileSync("lib/booking-creation-service.ts", "utf8");
const locale = fs.readFileSync("lib/i18n/translations/m4.ts", "utf8");

assert.ok(form.includes('const [invoiceEligibility, setInvoiceEligibility]'), "invoice eligibility state present");
assert.ok(form.includes('paymentMethod !== "invoice"'), "do not query eligibility for other payments");
assert.ok(form.includes('"/api/passenger/invoice-eligibility"'), "server determines invoice eligibility");
assert.ok(form.includes('result.eligible === true ? "approved" : "not-approved"'), "approved and unapproved status distinct");
assert.ok(form.includes('response.status === 401'), "guest user handled separately");
assert.ok(form.includes('setInvoiceEligibility("unavailable")'), "temporary service failure not confused with rejection");
assert.ok(form.includes('invoiceChoiceTag]'), "invoice choice uses contextual badge");
assert.ok(!form.includes('"Approval required"]'), "no unconditional approval warning");
assert.ok(form.includes('if (paymentMethod === "invoice") {'), "server recheck at booking submission remains");
assert.ok(api.includes('account?.status === "APPROVED"'), "server returns authoritative approved status");
assert.ok(booking.includes('invoiceAccount.status !== "APPROVED"'), "booking transaction requires current approval");
for (const key of ["accountRequired", "approved", "notApproved", "loginRequired", "unavailable", "checking"]) {
  assert.ok(locale.includes('"booking.invoiceStatus.' + key + '"'), "all languages must have key: " + key);
}
console.log("Invoice approval UI regression passed (conditional badge, API recheck, four locales).");
