const fs = require("fs");
const path = require("path");

const root = process.cwd();
function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
function must(file, text) {
  if (!read(file).includes(text)) throw new Error(file + " is missing: " + text);
}
function mustNot(file, text) {
  if (read(file).includes(text)) throw new Error(file + " still contains: " + text);
}

must("lib/security/session.ts", "from \"jose\"");
must("lib/security/session.ts", "issuer: \"drivo\"");
must("lib/security/session.ts", "audience: \"drivo-web\"");
must("lib/security/session.ts", "csrfCookieName");
must("lib/security/authorization.ts", "validateMutationSecurity");
must("lib/security/authorization.ts", "isAllowedOrigin");
must("lib/security/authorization.ts", "driver.status !== \"ACTIVE\"");
must("lib/security/authorization.ts", "admin.authVersion");
must("app/api/driver/me/route.ts", "authorizeDriver");
must("app/api/admin/me/route.ts", "authorizeAdmin");
must("app/api/bookings/[id]/route.ts", "authorizePassenger");
must("app/api/bookings/[id]/route.ts", "Use an authorized booking action endpoint");
must("app/api/dispatch/start/route.ts", "authorizeAdmin");
must("app/api/dispatch/start/route.ts", "authorizePassenger");
must("app/api/payments/checkout/route.ts", "authorizePassenger");
must("app/api/payments/checkout/route.ts", "booking.estimatedPrice");
must("app/api/payments/checkout/route.ts", "hasAuthoritativeBookingPrice(booking)");
must("app/api/payments/verify/route.ts", "hasAuthoritativeBookingPrice(booking)");
must("app/api/payments/webhook/route.ts", "hasAuthoritativeBookingPrice(booking)");
must("app/api/payments/webhook/route.ts", "verifyWebhookSignature");
must("app/api/track/[ref]/route.ts", "verifyTrackingToken");
must("app/api/driver/ride-requests/route.ts", "authorizeDriver");
mustNot("app/driver/dashboard/page.tsx", "localStorage.getItem");
mustNot("app/admin/layout.tsx", "localStorage.getItem");
mustNot("app/api/bookings/[id]/route.ts", "...body");
mustNot("app/api/payments/checkout/route.ts", "amount: parsed.data.amount");
console.log("Phase 3A static security checks passed");
