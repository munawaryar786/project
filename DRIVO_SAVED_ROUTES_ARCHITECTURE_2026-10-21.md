# Drivo — Saved Routes and Book Again — owner architecture review
**Date:** 2026-10-21
**Branch:** `fix/booking-time-route-2026-10-21` from live `b2e1651efd51e60f115696c6c1f37398d531c5b6`
**Status:** DESIGN / AWAITING ARCHITECTURE AND LIMIT APPROVAL. No implementation or migration authorized by this document.

## Owner-approved passenger experience
- At **successful booking receipt** (after an actual booking ID/ref is returned, never on an unconfirmed submit), show exactly three actions: **Save Route**, **Not Now**, **Save Always**.
- **Save Route** saves *that booking's* pickup and destination into the signed-in passenger's Saved Routes; does **not** turn on automatic saving.
- **Not Now** closes the prompt and leaves the preference unchanged. If automatic saving was already enabled, the option must not silently switch it off; show the current preference clearly.
- **Save Always** saves the current route and opts that authenticated passenger into automatically saving distinct future booked routes. Add a visible **Turn off automatic saving** control in settings.
- When logged in again, show a **Saved Routes** section in the passenger dashboard, each item showing start→end, service type and **Book Again**. Deletion supported.
- **Book Again** pre-populates route addresses and service selection in the existing accessible booking form. It must **not** submit, dispatch, charge, retain a stale old booking operation ID, or reuse expired schedule, fare, driver, customer identity, medical appointment data or card payment status. Quote is recomputed.
- Existing Booking History remains independent and unchanged. Optional future `Book Again` per historical booking could be supported after explicit scope approval, but initial request is saved routes.
- Unauthenticated/guest bookings must not create passenger-owned routes without an authorized account. Show sign-in/create-account path if appropriate; no route data leaks to unauthenticated clients.

## Proposed data minimization and storage
**Technology:** Existing production is Prisma 6 + MongoDB; do not introduce PostgreSQL or change backend architecture for this feature.
**Proposed model `PassengerSavedRoute`** (exact naming subject to review):
- `id String @id @default(auto()) @map("_id") @db.ObjectId`
- `passengerId String @db.ObjectId`, relation to Passenger + owner-scoped index
- `pickupAddress String`, `dropoffAddress String` (bounded lengths)
- `pickupPlaceId String?`, `dropoffPlaceId String?`, and trusted optional lat/lng, if available and validated
- `serviceType String` (must still pass current feature flags when reused)
- `routeHash String` (normalized source+destination+service, SHA-256 or equivalent; unique per passenger)
- `createdAt`, `updatedAt`, `lastUsedAt?`
- `@@unique([passengerId, routeHash])`, `@@index([passengerId, updatedAt])`
- `@@map("passenger_saved_routes")`
**Proposed Passenger setting:** `saveRoutesAlways Boolean @default(false)`, `savedRoutes PassengerSavedRoute[]`.
- Store **no** account passwords, raw JWT, payment data, customer/child identity, medical diagnoses, appointment date/time, special driver notes, flight details or other unnecessary data in this model.
- Do not clone whole bookings; route save reads from the already committed booking with verified `passengerId` ownership.
- Optionally store only display addresses and service type to minimize storage; precise place references aid identity but must be validated. Sensitive home/hospital route pairs remain private user data and are handled as personal data.
- **Proposed cap:** 20 distinct saved routes/account (discuss with owner; cap not approved yet). Existing routes are never silently deleted; at cap the UI explains the limit and lets the customer delete or explicitly replace a route. The auto-save preference may stay on but newly distinct routes must not overwrite existing selections.
- Deduplicate idempotently even for retries or concurrent clicks.
- Retain saved routes until user deletes one, account erasure, or a published retention policy requires otherwise. Add account data export/delete integration as appropriate.

## REST API (Next.js Route Handlers, existing app architecture)
All endpoints use existing canonical passenger session via `authorizePassenger`; POST/PATCH/DELETE honor Origin+CSRF and rate limits.
- `GET /api/passenger/saved-routes` -> bounded list newest/most recently used, no cross-account lookup.
- `POST /api/passenger/saved-routes` with `{bookingId}` -> read server Booking, prove `booking.passengerId===actor.id`, validate service/route, deduplicate via upsert or unique-key handling; return route ID; never trust arbitrary addresses from browser for save.
- `GET /api/passenger/saved-routes/[id]` -> owner-scoped retrieve for prefill, 404 on foreign route.
- `DELETE /api/passenger/saved-routes/[id]` -> owner-scoped delete; explicit user action.
- `GET /api/passenger/route-preferences` and `PATCH /api/passenger/route-preferences` with `{saveRoutesAlways:boolean}` -> strict Zod request and authorized session.
- Automatic saving when `saveRoutesAlways=true`: on *successfully created* owner-linked future booking, a bounded, idempotent route-write handler triggered after booking commit/confirmed account. No automatic driver notification, route dispatch or payments.
- Suppress automatic saving for unowned/guest/incomplete bookings.

## Frontend folder plan
- `components/passenger/SaveRoutePrompt.tsx` — three actions, clear confirmation/errors, keyboard/screen reader labels.
- `components/passenger/SavedRoutesList.tsx` — accessible saved route cards with Delete and Book Again.
- `components/booking/BookingConfirmation.tsx` — show save prompt after booking ID/ref and authorized account established.
- `app/passenger/dashboard/page.tsx` — Saved Routes near Booking History; keep existing account and history.
- `app/book/page.tsx` + `components/booking/BookingForm.tsx` — accept route **ID only** (e.g. `/book?savedRoute=<id>`), fetch authorized route, prefill once without overwriting a currently edited form or unsubmitted draft.
- `lib/saved-routes.ts` — owner-safe validation, route normalization/hash, dedup, cap, idempotence, read helpers.
- `app/api/passenger/.../route.ts` — REST endpoints above.
- `prisma/schema.prisma` and `lib/i18n/translations/en.ts`, `sk.ts`, `de.ts`, `uk.ts` — model and localized UI.
- `scripts/saved-routes-regression.ts` + API tests — mocked checks.

## Security and product acceptance checks
1. Login is via **existing** secure password hash/session flow, no browser-local password storage introduced.
2. User A can never list/read/update/delete User B's saved routes, even if IDs are guessed.
3. POST route save proves ownership of server-side created booking; retries and concurrent requests do not duplicate data.
4. `Not Now` never saves a route in first-time opt-in flow. `Save Always` is explicit and reversible.
5. No saved-route data visible after logout or on another person's session.
6. No stale scheduled dates/old prices or submitted operation IDs restored by Book Again; rerun Bratislava date validator and authoritative quote.
7. No automatic booking, driver dispatch, SMS/email, card charge, payment capture, or Stripe checkout from Book Again.
8. No medical details, notes, dates, child identifiers, or private account credentials in SavedRoute.
9. Saved route validation supports Slovakia and authorized Airport Transfer foreign airports VIE/BUD/PRG; feature flags prevent unavailable services.
10. Exact maximum count, deletion, duplicates, names, empty state, mobile UI, all language variants and accessibility tested.
11. Clean offline Prisma generate/validate, TypeScript, new saved-route integration tests and all existing booking/dispatch/payment/email tests, clean Next.js build, security review, CI PASS before release.
12. Review live current CI failure separately; no VPS actions, destructive migrations or live tests until owner sign-off and rollback plan.

## Development roadmap (after explicit owner confirmation of architecture)
1. Database model + bounded persistence & privacy, Prisma client generation in isolated environment.
2. Owner-scoped authenticated REST APIs, route dedup and preferences with mocked authorization tests.
3. Booking receipt Save Route/Not Now/Save Always and settings toggle.
4. Passenger dashboard Saved Routes and Book Again server prefill integration.
5. All locales, keyboard/screen-reader usability, mobile layouts, regression tests.
6. CI, build, zero-write test evidence, deployment/backup/migration plan and explicit go-live approval.

## Capacity and cost guidance (illustrative, not a hosting quotation)
Twenty small address-pair records per account are light compared to a full booking history. For example, 10,000 accounts × 20 routes = 200,000 route documents. At ~0.5–1.5 KB per document, raw document data is ~100–300 MB **before indexes, storage-engine overhead, replication and backups**. Actual MongoDB bills depend on cluster/tier, index sizes, traffic and retention. Do not store whole bookings to save space.

## Architecture sign-off decision
**Confirm:** Opt-in route-only storage; Save Route / Not Now / Save Always; dashboard Book Again; no password storage; only fresh quote and manual confirmation; propose 20 saved routes per passenger. Until approval, no schema migration or implementation is authorized.
