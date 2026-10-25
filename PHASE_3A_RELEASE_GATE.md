# Phase 3A release gate

A. RELEASE GATE: BLOCKED

Verification date: 2026-09-11. Branch: fix-admin-driver-vehicle-dashboard.
Only confirmed security/compatibility defects were corrected. No commit, push, deployment, credential rotation, db push, migration, production DB writes, or real email/SMS/payment actions were performed.

B. Scope audit

The tracked diff now contains 71 files, 1,051 additions and 2,071 deletions. The earlier 69-file figure excluded new files and predates this review. The complete untracked inventory is in P; git diff --stat does not include those files.

Reviewed changes fall within Phase 3A authentication, API ownership, CSRF callers, payment/tracking containment, privacy and verification. No Phase 3B feature or unrelated feature change was found. The Children feature flag and its existing gate were not changed.

Deleted files:
- lib/auth.ts, lib/jwt.ts, lib/auth-middleware.ts: superseded authentication helpers; no remaining imports or dynamic source references found.
- app/api/test/route.ts: removed public diagnostic endpoint.
- app/api/driver/layout.tsx: obsolete localStorage-based layout incorrectly placed under API routes.

package.json only changes the security verification command; no dependencies/lockfile change. prisma/schema.prisma adds only authVersion Int @default(0) to Passenger, Driver and AdminUser. .env.example contains blank secret placeholders and public sample origins/addresses. Middleware protects page navigation; APIs independently authorize.

Fixes made during this gate:
1. Require canonical JWT expiry/issued-at claims and nonnegative integer auth versions.
2. Use consistent Secure flags during legacy upgrade; prevent invalid canonical sessions from falling back to legacy authority and reject legacy authority after a version bump.
3. Reject nonlocal HTTP APP_ORIGIN and malformed localhost origin representations.
4. Forward continuation cookies to configured origin instead of request-derived host.
5. Authenticate dispatch before loading a booking; accept CONFIRMED card bookings; reject pending card/assigned/terminal bookings; preserve existing unexpired requests during sequential retries.
6. Remove passwordHash/authVersion from driver/passenger relation responses.
7. Persist a booking-reference/EUR/amount HMAC in existing fareBreakdown JSON when Pricing Engine V1 calculates the price. Checkout, verify and webhook reject unsigned or changed prices. No schema expansion or historical repricing was performed.
8. Restrict payment confirmation to atomic PENDING -> CONFIRMED; remove misleading process-local event Set.
9. Remove unneeded free text/flight details from offers; suppress tracking coordinates before an actual en-route/in-progress booking.
10. Enforce active passenger state and atomic OTP consumption; consume reset proof before password mutation.
11. Correct passenger page to submit phone/password and hide the existing unsupported standalone OTP entry.
12. Prevent GDPR export/deletion of contacts based only on an editable, unverified profile email. Those contacts now require separately verified handling.
13. Add isolated runtime regressions and correct overclaimed checklist completion.

C. Runtime auth flow result

Actual Next AppRouteRouteModule execution proves:
legacy drivo_passenger_token -> legacy JWT + stored session validation -> new canonical session -> next/headers cookies().set -> Next response cookie merge -> HTTP Set-Cookie.
The test checks __Host session/CSRF cookies, Secure, HttpOnly for the session, and SameSite=Lax. First legacy mutation returns 409 plus upgrade header/cookies; client helper retries with new CSRF.

Tested with fake DB records: passenger password login, existing OTP challenge verification, profile completion, cash/invoice continuation, logout revocation, reset proof consumption and canonical cookie reissuance. OTP/reset replays are rejected. Standalone OTP issuance was already disabled; it is not represented as a working standalone login flow. Registration/SMS delivery and browser cookie persistence were not exercised against real services.

Driver/admin login -> session and CSRF Set-Cookie -> /me -> logout endpoint passed isolated tests. Dashboard/layout restore through /me. Driver availability/location/request/status/earnings derive identity from authorization. All 31 protected admin/driver method exports return 401 without a cookie, independently of middleware. Public login handlers are excluded from that count.

Limitations: no full browser/GPS/staging run. Driver UI currently has no logout caller. Driver/admin logout clears only the actor's cookies; copied JWTs remain valid until TTL/version change. Passenger logout revokes stored sessions. Existing admin routes treat valid admin accounts alike; requireAdminRole is not wired to a differentiated permission matrix. No new role matrix was invented.

D. CSRF caller coverage

AST inspection found 39 frontend mutations and checked every caller:
- Passenger: BookingForm (booking, continuation, registration/proofs, login/reset/logout), BookingConfirmation (checkout/profile), passenger login/profile, payment success (verify): csrfFetch("passenger").
- Driver dashboard: location POST, availability/respond/status PATCH: csrfFetch("driver").
- Admin: bookings/assignment PATCH, dispatch POST, driver POST/PATCH, vehicle POST/PATCH, pricing/profiles/commissions PUT, logout POST: csrfFetch("admin").
- Raw fetch mutations are public contact, rental inquiry, distance preview, OTP send and driver/admin login.
- No authenticated caller missing its actor CSRF helper was found. GET restoration/polling requires no CSRF.
- GDPR endpoints have no frontend callers. Driver logout has no frontend caller.
- Runtime helper tests verify all three actor cookie/header mappings and one passenger upgrade retry.

E. Booking PATCH caller audit

Zero current frontend or application callers of generic PATCH /api/bookings/[id] found. Endpoint remains 405 with Allow: GET. Admin booking actions use the separate authenticated /api/admin/bookings endpoint. The runtime suite calls generic PATCH only to assert rejection.

F. Dispatch security/idempotency result

Unauthenticated requests now fail before a booking query; passenger ownership returns non-enumerating 404; assigned and terminal bookings cannot restart. CONFIRMED card dispatch is allowed; unpaid PENDING card dispatch is rejected. Admin calls use admin cookies/CSRF. Sequential repeated calls with a live offer return alreadyDispatched without expiration or creation.

BLOCKER / Phase 3C: read-active-request then create is not atomic. Concurrent starts can still create duplicate active requests; competing acceptance/status mutations are not transactionally serialized. Current overloaded booking status is not a durable payment ledger. Do not claim concurrent idempotency, automatic dispatch delivery, or race-free assignment.

G. Payment authority trace

Google distance + server pricing configuration -> lib/booking-quote.ts -> Pricing Engine V1 calculateFare -> stored estimatedPrice/fareBreakdown + serverPriceMac -> checkout verified amount -> formatAmountForStripe -> EUR Stripe session.
The MAC binds booking reference, exact stored amount and EUR using domain-separated server HMAC. Browser amount/fareBreakdown cannot become authority. Runtime tests tamper amount/reference, submit amount=1, request USD, and access another passenger's booking.

Checkout loads by authenticated passenger ownership, requires CARD/PENDING and a valid price MAC. Verify is read-only and checks ownership/reference/method/amount/currency/MAC. Webhook uses raw-body Stripe signature validation and matching booking metadata/amount/currency/MAC before atomic PENDING -> CONFIRMED. Delayed duplicate events cannot regress ASSIGNED, DRIVER_ENROUTE, IN_PROGRESS, NO_SHOW, COMPLETED or CANCELLED. Payment success only invokes verify.

New standard/airport/senior/accessible quotes match the V1 distance-preview endpoint under identical fixtures. /api/bookings/estimate remains the older advisory estimation endpoint; it is not used as payment authority.

Historical browser-origin prices have no trustworthy MAC and are now blocked for card payment. Existing in-flight legacy Stripe sessions also require reconciliation before deployment. Never sign an old stored browser price merely to bypass this guard.

Current duplicate deliveries produce one confirmation transition and one pair of email calls while the booking remains advanced. There is no durable PaymentEvent/outbox: a crash/email failure can lose delivery; an admin resetting status to PENDING can defeat state-based deduplication. Repeated checkout creation is not durably deduplicated. These are release limitations, not exactly-once guarantees.

Cash/invoice continuation passes isolated tests and keeps its payment-method handling. However, all new bookings now require the server Google distance quote; unavailable Maps/configuration blocks creation. Real Stripe, email, cash collection and invoice workflows remain unverified.

H. Tracking security result

24-hour token: booking ID, server expiry, 96-bit random nonce, HMAC-SHA256; domain-separated key usage. Tests cover correct scope, substitution, tampering and expiry. Owner session can also authorize. No bare-reference access.

Response fields:
success; booking.{ref,status,serviceType,pickupAddress,dropoffAddress,scheduledDate,scheduledTime,dispatchStatus,progress};
driver is null or {name,lat,lng,lastUpdate,vehiclePlate,vehicleType}.
Terminal states omit addresses and driver data. Coordinates are emitted only for DRIVER_ENROUTE/IN_PROGRESS plus driver.isOnTrip. Terminal tokens retain limited status/schedule access until expiry; they are not fully revoked.

Application tracking code does not log tokens. Reverse-proxy/hosting query-string logging was not accessible and requires redaction verification. Concurrent multiple active assignments remain a Phase 3C location-association limitation.

I. Offer privacy result

Exact response envelope:
success, driver, rideRequests, total, timestamp.

driver:
id, fullName, status, isOnline, isOnTrip.

Each rideRequests[]:
id, bookingId, driverId, status, sentAt, respondedAt, expiresAt, createdAt, booking.

Each booking (45 fields):
id, bookingRef, status, dispatchStatus, serviceType,
pickupAddress, dropoffAddress, pickupLat, pickupLng, dropoffLat, dropoffLng,
scheduledDate, scheduledTime, passengerCount, luggageType, smallBags, largeBags,
wheelchairNeeded, seniorPassenger, ztpCardHolder, wheelchairUser, companionRequired,
waitingTimeRequired, assistanceLevel, wheelchairType, canTransferToSeat, wavRequired,
passengerRemainsInWheelchair, companionCount, tripType, returnDate, returnTime,
waitingDuration, scheduledRide, recurrence, recurrenceType, pickupDate, pickupTime,
waitAndGreet, languagePref, paymentMethod, cashAgreed, estimatedPrice, distanceKm, vehicleRequired.

No passenger name/phone/email, medical appointment/institution details, child/guardian identities, private notes, credentials, arbitrary custom waiting/recurrence text or flight details. Operational assistance/disability booleans remain; this is not a claim that the offer contains no sensitive operational context.
Exact pickup/dropoff addresses and coordinates remain ONLY as the temporary Phase 3E compatibility exception; addresses can themselves reveal a school/hospital destination. Tests verify sensitive sentinel values are absent from serialized offers.

J. authVersion deployment requirement

Installed generated Prisma Client: 6.19.3, engine c2990dca591cba766e3b7ef5d9e8a84796e47ab7.
The generated schema includes all three authVersion fields.

Source-level verification of that exact engine:
- [document_to_record](https://github.com/prisma/prisma-engines/blob/c2990dca591cba766e3b7ef5d9e8a84796e47ab7/query-engine/connectors/mongodb-query-connector/src/root_queries/mod.rs#L25) substitutes BSON Null for an absent field.
- [required-field output metadata](https://github.com/prisma/prisma-engines/blob/c2990dca591cba766e3b7ef5d9e8a84796e47ab7/query-engine/connectors/mongodb-query-connector/src/output_meta.rs#L90) retains a required scalar's static default.
- [scalar conversion](https://github.com/prisma/prisma-engines/blob/c2990dca591cba766e3b7ef5d9e8a84796e47ab7/query-engine/connectors/mongodb-query-connector/src/value.rs#L282) returns that default for BSON Null.

Therefore missing OR explicitly null authVersion reads as 0 for these required @default(0) fields. This is a read-time materialization; it does not backfill Mongo. Current ?? 0 is a defensive application fallback after the Prisma read. Login need not fail merely because existing documents lack this field. Incompatible stored types can still cause conversion failure before the fallback.

Required preparation: regenerate/deploy the matching Prisma Client; inspect production field types/read compatibility with an approved read-only check; retain existing nonzero versions. No db push or backfill is required merely for these reads. Before future raw/version-increment operations, explicitly initialize missing/null versions to integer zero under a reviewed migration. No database preparation was executed and production data quality is unverified.

K. Environment/client-bundle safety

Environment validation is lazy; importing lib/env.ts does not read required values until a function is called. Production build succeeds without the new security configuration, which means build success is NOT runtime configuration readiness.

38 client entry modules were traversed: no import path into env/session/authorization/Stripe/server quote/tracking signing modules found.
37 generated browser JS/map/JSON files were scanned for server secret names and available secret values without printing values: zero matches. No NEXT_PUBLIC secret variable names found. Credential-pattern scan of added diff found none; runtime fixtures use conspicuously synthetic keys.

Local release environment: DATABASE_URL exists; AUTH_SIGNING_SECRET, CSRF_HMAC_SECRET and APP_ORIGIN are absent. Target deployment configuration was not inspected. Configure the required server-only secrets/origin before rollout; do not deploy current runtime with these missing. Keep configured legacy JWT_SECRET available for the intended passenger migration window.

Remaining legacy classification: jsonwebtoken/@types/jsonwebtoken in package/lockfile are unused production dependencies; test-phase4-5.js tests the legacy library with synthetic data. The new runtime suite uses Bearer only for a rejection assertion. No production localStorage/Bearer auth authority or broken deleted-helper reference found. Historical documentation is not executable authority.

L. Children/other-service regression

Feature flag implementation is unchanged. Disabled Children creation returns 409 before booking writes in the runtime test; the booking UI continues to filter that service. Existing Children read/driver/admin/dispatch paths have no feature-flag rejection added. No backend Children models/data were removed.
Existing unsigned Children CARD bookings share the historical payment blocker; do not call all existing bookings fully operational until reconciliation.

Standard, airport, senior and accessible server V1 quote parity passed fixtures. Cash/invoice continuation passed. Rental, real Maps, end-to-end bookings, browser Children visibility and actual existing-booking operations were not service-tested. No WAV activation or future-phase work was implemented.

M. Exact test/build results

- git diff --check: PASS (exit 0; line-ending warnings only).
- npm run security:phase3a: PASS (static checks plus 20 isolated runtime groups, including 31 protected method exports).
- npx tsc --noEmit --pretty false: PASS, exit 0.
- npm run lint: PASS, exit 0.
- npm run build: PASS, exit 0; final compilation completed and 84 static pages were generated. Existing middleware-to-proxy deprecation warning only.
- npx prisma validate: PASS, exit 0; schema valid; no db push.
- node test-phase4-5.js: exit 0, reported 8/8. Its synchronous test wrapper does not await the async bcrypt case before process.exit, so this legacy result is weak evidence.
- test-mongodb.js / test-mongodb-connection.js: not run; live-connection diagnostics are not isolated release regressions.
- Client graph / bundle / added-credential scans: passed as described above.

An initial new GDPR test used the wrong fixture key and returned 400; it was corrected to the existing confirmation:true contract. Final security run passes all groups. Runtime tests fake Prisma/Stripe/Maps/email/rate-limiter wrappers, block unexpected fetch, use real jose/bcrypt/Next route/cookie code, and do not establish live service or distributed behavior.

N. Confirmed blockers before commit

Release gate is not approved:
- Resolve or explicitly disposition Phase 3C concurrent dispatch/acceptance races.
- Review unsigned historical card/in-flight session containment and reconciliation plan.
- Review absence of durable payment event/side-effect/checkout deduplication.
- Review driver/admin logout token-replay window and missing driver UI logout path.
- Complete browser/service acceptance evidence; current tests cannot establish full end-to-end compatibility.
No commit was created.

O. Confirmed blockers before production deployment

All unresolved N items, plus:
- Supply and validate production AUTH_SIGNING_SECRET, CSRF_HMAC_SECRET and HTTPS APP_ORIGIN.
- Regenerate the matching Prisma Client and inspect actual Mongo version-field types without overwriting valid versions.
- Reconcile unsigned historical card bookings and open legacy checkout sessions before enabling payments.
- Validate Google distance service, Stripe signed webhook/retries, SMS/email delivery, actual cookies/CSRF/GPS and existing Children operations in staging.
- Verify query-token redaction in hosting/proxy logs and document the Phase 3E address exception.
- Establish monitoring/recovery for non-durable payment notifications and local-only rate limiting.

P. git status --short

Current snapshot: 71 tracked paths changed, plus 11 untracked paths listed by git status. The tracked status includes 3 deletions (app/api/driver/layout.tsx, app/api/test/route.ts, lib/auth*.ts helpers) and the remaining paths are modified/new.

Q. git diff --stat

Tracked diff: 71 files changed, 1,051 insertions(+), 2,071 deletions(-). Untracked additions are excluded by git diff --stat.

PHASE 3A RELEASE GATE COMPLETE ? AWAITING PROJECT OWNER REVIEW
