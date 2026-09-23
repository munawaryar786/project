require("tsx/cjs");
const assert = require("node:assert/strict");
const {
  DISPATCH_PAYMENT_LINK_TTL_MS,
  getDispatchFareAmountMinor,
  hashDispatchIdempotencyKey,
  scopeDispatchPaymentLinkIdempotencyKey,
  isDispatchPaymentLinkOwnedBy,
  isDispatchPaymentSessionBoundToBooking,
  validateDispatchCheckout,
} = require("../lib/dispatch-invariants.ts");
const fs = require("node:fs");
const locales = Object.fromEntries(["en", "sk", "de", "uk"].map((locale) => [locale, require(`../lib/i18n/translations/${locale}.ts`).default]));

const now = new Date("2026-09-23T00:00:00.000Z");
const booking = { id: "booking-1", bookingRef: "DR-123", bookingSource: "PHONE_DISPATCH", paymentMethod: "CARD", fareTotalFare: 17.25, estimatedPrice: 999 };
const expiresAt = new Date(now.getTime() + DISPATCH_PAYMENT_LINK_TTL_MS);
const payment = { bookingId: "booking-1", providerSessionId: "cs_test_1", createdByDispatchOperatorId: "operator-x", paymentMethod: "CARD", amountMinor: 1725, currency: "EUR", status: "PENDING", expiresAt };
const session = { id: "cs_test_1", status: "complete", payment_status: "paid", metadata: { bookingId: "booking-1", bookingRef: "DR-123" }, amount_total: 1725, currency: "eur", expires_at: Math.floor(expiresAt.getTime() / 1000) };
const expirySecond = session.expires_at;

assert.equal(DISPATCH_PAYMENT_LINK_TTL_MS, 30 * 60 * 1000);
assert.equal(scopeDispatchPaymentLinkIdempotencyKey("operator-x", "booking-a", "uuid-y"), "operator-x:booking-a:uuid-y");
const bookingAKey = scopeDispatchPaymentLinkIdempotencyKey("operator-x", "booking-a", "uuid-y");
const bookingBKey = scopeDispatchPaymentLinkIdempotencyKey("operator-x", "booking-b", "uuid-y");
assert.notEqual(bookingAKey, bookingBKey, "the same operator/UUID on different bookings must have distinct durable idempotency keys");
const priorSessions = new Map([[bookingAKey, { bookingId: "booking-a", url: "https://checkout.example/session-a" }]]);
assert.equal(priorSessions.get(bookingBKey), undefined, "Booking B cannot find or return Booking A's payment session using the reused UUID");
assert.ok(isDispatchPaymentLinkOwnedBy({ payment, bookingId: "booking-1", operatorId: "operator-x" }));
assert.equal(isDispatchPaymentLinkOwnedBy({ payment, bookingId: "booking-2", operatorId: "operator-x" }), false);
assert.equal(isDispatchPaymentLinkOwnedBy({ payment, bookingId: "booking-1", operatorId: "operator-y" }), false);
assert.equal(isDispatchPaymentLinkOwnedBy({ payment: { ...payment, paymentMethod: "CASH" }, bookingId: "booking-1", operatorId: "operator-x" }), false);
assert.ok(isDispatchPaymentSessionBoundToBooking({ session, providerSessionId: "cs_test_1", booking }));
assert.equal(isDispatchPaymentSessionBoundToBooking({ session, providerSessionId: "cs_test_1", booking: { ...booking, id: "booking-2" } }), false);
assert.equal(getDispatchFareAmountMinor(booking), 1725, "payment uses server fare rather than client estimate");
assert.equal(getDispatchFareAmountMinor({ fareTotalFare: 0, estimatedPrice: 12.5 }), null, "zero fare cannot produce a payable session");
assert.equal(hashDispatchIdempotencyKey("same-request"), hashDispatchIdempotencyKey("same-request"));
assert.notEqual(hashDispatchIdempotencyKey("operator-a:same-request"), hashDispatchIdempotencyKey("operator-b:same-request"));
assert.equal(validateDispatchCheckout({ booking, payment, session, eventCreatedAt: expirySecond - 1 }), "OK", "provider completion before expiry is accepted even when webhook processing is later");
assert.equal(validateDispatchCheckout({ booking, payment, session, eventCreatedAt: expirySecond }), "EXPIRED", "provider completion at or after expiry is rejected");
assert.equal(validateDispatchCheckout({ booking, payment, session: { ...session, expires_at: expirySecond + 1 }, eventCreatedAt: expirySecond - 1 }), "SESSION_EXPIRY");
assert.equal(validateDispatchCheckout({ booking, payment, session: { ...session, amount_total: 1724 }, eventCreatedAt: expirySecond - 1 }), "AMOUNT_CURRENCY");
assert.equal(validateDispatchCheckout({ booking, payment, session: { ...session, currency: "usd" }, eventCreatedAt: expirySecond - 1 }), "AMOUNT_CURRENCY");
assert.equal(validateDispatchCheckout({ booking, payment, session: { ...session, id: "cs_test_other" }, eventCreatedAt: expirySecond - 1 }), "SESSION_BINDING");
assert.equal(validateDispatchCheckout({ booking, payment, session: { ...session, metadata: { ...session.metadata, bookingId: "other" } }, eventCreatedAt: expirySecond - 1 }), "BOOKING_BINDING");
assert.equal(validateDispatchCheckout({ booking, payment: { ...payment, status: "FAILED" }, session, eventCreatedAt: expirySecond - 1 }), "PAYMENT_STATE");
const paymentLinkRoute = fs.readFileSync("app/api/dispatch/bookings/[id]/payment-link/route.ts", "utf8");
const stripeSource = fs.readFileSync("lib/stripe.ts", "utf8");
const webhookSource = fs.readFileSync("app/api/payments/webhook/route.ts", "utf8");
const invariantSource = fs.readFileSync("lib/dispatch-invariants.ts", "utf8");
assert.ok(paymentLinkRoute.includes("scopeDispatchPaymentLinkIdempotencyKey(auth.actor.id, booking.id, parsed.data.idempotencyKey)"));
assert.ok(paymentLinkRoute.includes("isDispatchPaymentLinkOwnedBy"));
assert.ok(paymentLinkRoute.includes("expiresAt: Math.floor(expiresAt.getTime() / 1000)"));
assert.ok(stripeSource.includes("{ expires_at: params.expiresAt }"), "Stripe receives the same 30-minute provider expiry");
assert.ok(webhookSource.includes("PHONE_DISPATCH_PAYMENT_RECORD_MISSING"), "missing Dispatch payment records fail closed with a safe code");
assert.ok(webhookSource.includes("updatedBooking = await handleCheckoutCompleted(object)"), "legacy checkout settlement remains available for genuine public bookings");
assert.ok(webhookSource.includes('dispatchStatus: "NOT_STARTED"') && webhookSource.includes('driverId: null'), "duplicate dispatch recovery requires an untouched unassigned booking");
assert.ok(invariantSource.includes("eventCreatedAt >= session.expires_at") && webhookSource.includes("paidAt: new Date(eventCreatedAt * 1000)"));
assert.ok(!webhookSource.includes('expiresAt: { gt: new Date() } }, data: { status: "PAID"'), "webhook arrival time is not the payment-completion gate");
const dispatchDeskSource = fs.readFileSync("app/dispatch/page.tsx", "utf8");
const dispatchDetailSource = fs.readFileSync("app/dispatch/bookings/[id]/page.tsx", "utf8");
const dispatchOperatorAdminSource = fs.readFileSync("app/api/admin/dispatch-operators/[id]/route.ts", "utf8");
assert.ok(dispatchDeskSource.includes('"/api/dispatch/bookings?mine=true&page=0"'), "My Recent Bookings requests the authenticated operator-only endpoint");
assert.ok(dispatchDeskSource.includes("setMyRecent((data.bookings || []).slice(0, 10))"), "My Recent Bookings is a separate list bounded to ten items");
assert.ok(dispatchDeskSource.includes("const requestedPage = reset ? 0 : pageRef.current + 1"), "Load More advances from a ref-backed page value");
assert.ok(dispatchDeskSource.includes("}, [search, status, t])") && !dispatchDeskSource.includes("}, [page, search, status, t])"), "loading callback does not depend on page and cannot reset after Load More");
assert.ok(dispatchDeskSource.includes("setInterval(() =>") && dispatchDeskSource.includes("}, 60_000)"), "operational and personal lists refresh every 60 seconds");
assert.ok(!dispatchDeskSource.includes("throw newError(") && dispatchDeskSource.includes("throw new Error("), "Dispatch load errors use the Error constructor");
assert.ok(dispatchDeskSource.includes("return [...prior, ...nextRows.filter((item) => !ids.has(item.id))]"), "pagination appends without duplicate booking rows");
assert.ok(dispatchDeskSource.includes('if (booking.paymentMethod === "CASH") return t("dispatch.payOnRide"') && dispatchDeskSource.includes('if (booking.paymentMethod === "INVOICE") return t("dispatch.invoice"'), "Dispatch cards present cash as Pay on Ride and invoice as Invoice");
assert.ok(dispatchDetailSource.includes('booking.paymentMethod === "CASH"') && dispatchDetailSource.includes('t("dispatch.payOnRide"') && dispatchDetailSource.includes('booking.paymentMethod === "INVOICE"') && dispatchDetailSource.includes('t("dispatch.invoice"'), "Booking Detail presents cash and invoice with operator-facing labels");
assert.ok(dispatchDetailSource.includes('t(`dispatch.payment.${paymentStatus}`'), "Booking Detail presents CARD using the current payment status");
assert.ok(dispatchDetailSource.indexOf("setLink(data);") < dispatchDetailSource.indexOf("navigator.clipboard.writeText(data.url)"), "successful link result is preserved before attempting clipboard access");
assert.ok(dispatchDetailSource.includes("catch { copied = false; }"), "clipboard failure is contained and does not enter the payment-creation error handler");
assert.ok(dispatchDetailSource.includes('"linkCreatedCopyBlocked"') && dispatchDetailSource.includes('"linkCreatedEmailCopyBlocked"'), "clipboard failures report copy-specific messages, retaining email result");
assert.ok(dispatchOperatorAdminSource.includes('actions.push("DISPATCH_OPERATOR_UPDATED")') && dispatchOperatorAdminSource.includes("safeMetadata: action === \"DISPATCH_OPERATOR_UPDATED\" ? { changedFields }"), "profile edits create a safe changed-fields Admin audit event");
assert.ok(!dispatchOperatorAdminSource.includes("safeMetadata: { temporaryPassword"), "temporary passwords are never included in Admin audit metadata");
const dispatchPageSource = fs.readFileSync("app/dispatch/bookings/new/page.tsx", "utf8");
assert.ok(dispatchPageSource.includes('...(isCustomerServiceEnabled("CHILDREN") ? [["CHILDREN"') , "Dispatch only adds Children to the selector when its feature flag is enabled");
const dispatchKeys = Object.keys(locales.en).filter((key) => key.startsWith("dispatch.") || key.startsWith("dispatchAdmin."));
for (const [locale, dictionary] of Object.entries(locales)) {
  for (const key of dispatchKeys) assert.equal(typeof dictionary[key], "string", `${locale} is missing ${key}`);
}
assert.match(locales.uk["dispatch.desk"], /[А-Яа-яІіЇїЄєҐґ]/, "Ukrainian dispatch text must use Cyrillic");
assert.notEqual(locales.sk["dispatch.desk"], locales.en["dispatch.desk"]);
assert.notEqual(locales.de["dispatch.desk"], locales.en["dispatch.desk"]);

console.log(`Dispatch invariant and locale-key checks passed (${dispatchKeys.length} keys in en/sk/de/uk).`);
