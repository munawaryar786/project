# Drivo Saved Routes / Smart Rebooking — implementation architecture

Source baseline: user's `drivo-savedroutes-source.tar.gz` captured from `/home/administrator/drivo-integration-20261023-045655` on 2026-10-25. **Do not merge/reset/pull blindly: 294 other local changes may exist.**

## Functional and security contract

1. Only passenger sessions with canonical session+CSRF+origin permissions can mutate saved routes. Each read/edit/delete uses `passengerId=auth.actor.id`; no `passengerId` authority comes from browser.
2. From confirmation, server `POST` receives only bookingId and an optional `saveAlways`. It re-reads an **owned, verified, authenticated WEB booking**. `Not Now` is a UI-only skip. `Save Always` saves this route and persists an opt-in preference.
3. `SavedRoute` holds ONLY user-consented addresses+coords, service, passenger count, bag quantities and general airport preference. It excludes children names, guardian info, medical/diagnosis/assistance details, contact data, flight numbers, trip schedule, payment details and historic fare.
4. CHILDREN service templates can be saved only on **explicit selection** while the feature flag enables the service. Never auto-save a child's route. At rebooking, original child/guardian names, schedules and institution verification must be re-entered.
5. `autoSaveRoutes` defaults `false`. On successful verified public booking creation, the opt-in preference is honored after booking commit. Failure to save a convenience template **must not make a confirmed booking fail**. User can switch it off in dashboard.
6. Max 25 routes per user (best-effort application cap; concurrent distinct creates may briefly exceed 25; this needs database-backed concurrency gate before claiming strict global cap). SHA-256 fingerprint of normalized pickup, drop-off and service provides idempotence and unique per-passenger route. Editing supports label/service/addresses/passengers/luggage/airport preferences. Address changes invalidate cached coordinates.
7. `Book Again` fetches the authorized saved route, never uses user-supplied URL data, refills the unsubmitted booking form, resets date/time, price/payment/auth/medical sensitive information and requires normal geocoding, live quote, validation, confirmation, and Stripe/cash flow. Booking is never submitted automatically.
8. The existing draft/identity/booking-operation uncertainty safeguards take priority. A pending draft must be resolved before using a saved route. No localStorage route database and no saved-route data returned on a public endpoint.
9. All new user-facing copy is provided in EN, SK, DE, UK; final linguistic review required.

## API contract

- `GET /api/passenger/saved-routes` -> `{success,routes,autoSaveRoutes}` (max 25, `private, no-store`).
- `POST /api/passenger/saved-routes` `{bookingId,saveAlways}` -> 200, 404 for unknown/nonowned booking, 409 for ineligible/limit, 503 transient save failure.
- `GET /api/passenger/saved-routes/:id` -> safe projection or 404.
- `PATCH /api/passenger/saved-routes/:id` strict edit allowlist; 404 nonowned, 409 duplicate/ineligible.
- `DELETE /api/passenger/saved-routes/:id` -> safe delete owned route or 404.
- `PATCH /api/passenger/saved-routes/preferences` `{autoSaveRoutes:boolean}`.

## Database / deployment

- Add `SavedRoute` model and `Passenger.savedRoutes` relation, `Passenger.autoSaveRoutes Boolean @default(false)`.
- Prisma Mongo composite unique `(passengerId, fingerprint)`; index `(passengerId, updatedAt)`.
- **No database push, migration, credential import, live writes, production restart, or git changes are performed by this patch.**
- Schema rollout only in **fully isolated Mongo replica-set staging** with dedicated identity and independently isolated Redis; never use existing port 3001 Canary for writes (its DB and Redis targets match production).
- After secure staging provisioning: `prisma validate`, `prisma generate`, TypeScript `tsc --noEmit --incremental false`, lint, build, full prior phase regression suite, isolated API/DB tests including duplicate race/IDOR; then separate deployment approval and rollback readiness. Re-check release checklist for pending unrelated Drivo requirements.

## Limitations / release blockers

- The submitted source bundle does **not** include `node_modules`, `tsconfig.json`, complete old scripts and deployed runtime. Local checks cover TS syntax transpilation and isolated domain fake-DB behavior; **NOT** full TypeScript typecheck, Prisma generate/validate, real Mongo concurrency, browser or integrated payments.
- Saved-route limit is enforced by application count plus unique index, not a hard serialized per-user quota under concurrent different routes.
- Translation copy and accessibility need a human/browser QA pass.
- No live data migration or release performed; need environment-independent staging and all production readiness gates closed first.
