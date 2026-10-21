# Drivo — Production work tracker (2026-10-21)

**Base:** exact live release commit `b2e1651efd51e60f115696c6c1f37398d531c5b6`.  
**Work branch:** `fix/booking-time-route-2026-10-21`.  
**Safety:** Never automatically deploy this branch, merge onto outdated `main`, alter production customer/booking records, run live payment/OTP/ride-creation tests, or rotate keys without owner approval. Preserve CARD option; Stripe activation deferred. Both legacy same-email passenger accounts belong to owner and must not be merged/deleted.

## Complete project/system checklist (production requirements)

- [x] Phase-1 location/business scope documented: Bratislava, Slovakia; Drivo transport and marketing/recruitment platform.
- [ ] Verified, production-ready customer booking: Standard Taxi, priority ZŤP/PRM Taxi, Seniors, Special-Needs Children (service currently feature-disabled), Airport & Tourism Transfers.
- [ ] Driver car-rental ecosystem: taxi/food-delivery weekly rental, benefits and onboarding; independent and fleet driver support; future fuel/car-wash partnerships documented.
- [ ] Standard 7-seat vehicle rule: max six passengers; at most five with excess luggage; suggest larger vehicle/tourism transfer.
- [ ] WAV labeled **Coming Soon** with activation feature flag and future booking capability (not currently falsely bookable).
- [ ] Uber/Bolt UX/a11y/market-gap review delivered to owner and approval captured before new UI phases.
- [ ] Architecture approved/reviewed: passenger/driver/admin subsystems; Next.js, React, TypeScript, TailwindCSS; backend Node.js/Express where applicable; REST; auth; cloud; documented actual data engine (current production uses **Prisma + MongoDB**, unlike initial PostgreSQL specification).
- [ ] Database schema, API structure, folder structure, architecture and development roadmap are up-to-date and approved before major next phase.
- [ ] Passenger features verified end-to-end: pickup/destination, service, capacity, bags, price estimate, create/confirm booking, account registration/login/password reset.
- [ ] Driver features verified end-to-end: registration, onboarding, rental description, benefits, fleet/independent future readiness.
- [ ] Admin features verified end-to-end: rides, drivers, vehicles, service categories, monitoring and marketing content management.
- [ ] WCAG-oriented high contrast, large touch targets, keyboard/screen-reader support, errors and simple flows across all roles.
- [ ] Multi-city/multilingual/multi-country architecture assessed; phase 1 remains Bratislava.
- [ ] Security: JWT/session protections, rate limits, origin/CSRF, least privilege, secret isolation and verified TLS.
- [ ] SEO, privacy/terms, customer support and cloud deployment/regression verified.

## Current production incident / fixes — strict order

- [x] **Booking-date bug diagnosed:** read-only audit of 6 bookings (last 14 days) found 2 created with a past pickup; both still non-terminal. Example `DRV-2026-09937053` created Oct 21 with Oct 13 pickup, €41.03 fare consistent with stored 37.3 km. Do not mutate historical records without owner's approval.
- [x] **Date/time staging prototype on VPS** in `/home/administrator/drivo-booking-time-review-b2e1651`: new market-time utility, browser Bratislava clock, server NOW vs SCHEDULED pickup semantics, strict past-date rejection. Typecheck and 6 regression suites passed. **Not deployed.**
- [x] Port earlier staging date/time fix to exact-release GitHub review branch (schema pickupMode; browser market clock; server NOW/SCHEDULED guard; market-booking-time helper; initial regression file). **Changes committed; no fresh CI/build run yet.**
- [ ] Expand date/time tests to full API integration with UTC→Bratislava, DST boundaries, previous-day rejection, NOW spoof protection, scheduled future acceptance and child pickup overrides; rerun TypeScript and all existing suites on branch.
- [ ] Inspect related booking idempotency, card-checkout timing, scheduled-dispatch semantics, and guard against regressions.
- [ ] **Isolated production build:** prior Turbopack build FAILED because staging `node_modules` is a symlink pointing outside Turbopack's root — build layout issue, not a demonstrated app-code failure. Rebuild with real local dependencies or `next build --webpack` in staging; do not modify production `node_modules`. Perform required tests and browser-key checks without revealing keys.
- [ ] **Maps**: enforce Slovakia/Bratislava phase-1 country bounds for resolved pickup and destination; avoid stale/re-geocoded coordinates; compare place details, server route/distance and preview. Google autocomplete `components=country:sk` alone does not guarantee subsequent geocoder results are Slovak.
- [ ] **Pricing**: remove/replace preview-only `€3 + €1.50/km` in RouteMap; show authoritative `/api/bookings/distance` quote, and ensure route details and final persisted fare are consistent.
- [ ] **Booking confirmation**: customer emails should accurately describe PENDING vs CONFIRMED and CARD chosen vs card actually paid. Verify fare, date/time, timezone, pickup/destination.
- [ ] **Customer authentication/forgot password**: Redis TLS main Next process fixed temporarily using `NODE_USE_SYSTEM_CA=1`; confirm browser flows, reset email deliverability, and persist environment across PM2 reboot. Legacy duplicate email accounts are expected/owned and not to be merged.
- [ ] **Passenger→Driver→Admin**: exercise non-destructive mocked checks off-production, then explicitly approved production smoke; no fake customer-facing trips or unsolicited driver notifications.
- [ ] Google browser/server API key restrictions (separate restricted keys), Twilio sandbox→approved production WhatsApp sender, SMTP delivery and Stripe live activation **deferred**.
- [ ] VPS SSH login issue investigated only when owner regains access; preserve credentials and root-cause details. Never request secret passwords/keys in chat.
- [ ] Check staging vs base diff, test and CI evidence, approval, backups/rollback, and PM2 env persisted; then separately authorize deployment.
- [ ] Post-deploy verify HTTPS pages, booking-time validation, maps route/fare, passenger login, realtime worker, card pending behavior and error logs without creating real rides.

## Release gate
No live deployment or merge without owner approval. Capture full test/build results, base SHA, commit SHA, rollback path and precise deployment command. Do not claim passed tests are sufficient for end-to-end production correctness.

## Offline update note (VPS SSH currently unavailable)
- GitHub work branch commits include `lib/market-booking-time.ts`, `scripts/booking-time-regression.ts`, `lib/booking-schema.ts`, `lib/booking-creation-service.ts`, and `components/booking/BookingForm.tsx`. GitHub changes are **not deployed**.
- VPS review results reported before SSH outage: isolated TS PASS, 6/6 source/invariant suites PASS. Next.js/Turbopack production build FAILED solely on external `node_modules` symlink; retry isolated build without symlink or via `next build --webpack` once workspace access returns, and verify normal production build in clean CI.
- User has chosen to postpone Stripe setup but keep card selection. Existing duplicate-email passenger accounts are intentionally retained.

## Owner's new 2026-10-21 screenshot requirements (VPS offline)

- [x] Diagnose foreign-airport autocomplete root cause: Google Places originally constrained to `components=country:sk`, so full Vienna/Budapest airport names did not appear; partial “Vienna Airport” could match a Bratislava taxi business.
- [x] **Branch source changes saved (UNTESTED in branch):** curated Bratislava (BTS), Vienna (VIE), Budapest (BUD), Prague (PRG) airport-transfer suggestions; foreign airport coordinates resolved via Google Geocoding only if the returned country matches; ordinary generic autocomplete still scoped to Slovakia. Airport mode is passed from booking pickup/dropoff UI to autocomplete endpoint and fallback coordinate lookup.
- [x] **Branch source changes saved (UNTESTED in branch):** medical appointment form redesigned to match provided black reference *structure* while retaining white Drivo styling: hospital/clinic; department/room/entrance; one-way versus round-trip; scheduled outbound home pickup date/time; appointment date/time; fixed/flexible return; date/time if fixed; driver notes; WAV Coming Soon. Validation and `returnTimingPreference` field added to Zod schema, booking creation and Prisma Mongo schema.
- [x] Add localized medical field labels in existing EN/SK/DE/UK dictionaries; add offline static/pure regression file `scripts/airport-medical-regression.ts`.
- [ ] **MANDATORY BEFORE MERGE/DEPLOY:** Run `prisma generate` in isolated copy for added field, `tsc --noEmit`, `tsx scripts/booking-time-regression.ts`, `tsx scripts/airport-medical-regression.ts`, all six previously-passing suites, `next build` in clean non-symlink environment, and inspect diffs. None of the new changes have passing test/build evidence yet.
- [ ] **MANDATORY BEFORE LIVE:** Verify real Google API suggestions, country validation, distances, routing, place IDs and coordinates for BTS/VIE/BUD/PRG with restricted API keys; check every selected airport route against actual driveable airport entrance and that first suggestion is not a taxi company. Avoid production paid bookings.
- [ ] **MEDICAL RETURN BUSINESS REVIEW:** Existing server quote for non-children bookings computes outbound leg only. Form now clearly warns return timing/total return fare need confirmation; decide and implement complete return-trip quoting/dispatch/payment handling before advertising a fully priced round-trip. Flexible return is a preference, not guaranteed driver availability.
- [ ] **MONGO SCHEMA CHANGE:** New optional `Booking.returnTimingPreference` requires careful owner-approved schema synchronization/migration review (`prisma db push` not to be run automatically against live DB). Ensure no existing records are altered.
- [ ] **I18N/UX:** Double-check new appointment/return field prompts across all supported languages and accessibility focus/keyboard/error messaging. Check mobile and desktop screenshots.
- [ ] Owner approval, verified backup + rollback and VPS login restoration required before deployment. Stripe still postponed, CARD UI preserved.

Screenshot request completed in code only; do **not** mark operationally complete until final testing, live QA and owner sign-off.
