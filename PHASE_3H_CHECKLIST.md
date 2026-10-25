# DRIVO Phase 3H Checklist and Architecture Lock

Baseline audited before implementation:
- Branch: phase-3g-driver-earnings-ledger
- Approved parent: 8e381d5 Add driver earnings ledger and accounting
- Worktree: clean
- Scope boundary: no payouts, wallet, bank transfer, commission policy, fleet settlement, arbitrary status editor, ledger mutation, customer impersonation, production writes, db push, migration, seed, commit, or push.

## Mandatory audit

1. Existing admin pages/routes: dashboard, bookings, drivers, tracking, vehicles, pricing, financial, login/layout; existing admin API routes are reused.
2. Admin authentication/authorization: authorizeAdmin uses canonical ADMIN session, actor lookup, authVersion, CSRF and Origin for unsafe methods.
3. Ride/booking management: GET/PATCH /api/admin/bookings and admin bookings page exist; arbitrary status PATCH is an existing compatibility path and Phase 3H operations actions will use separate safe endpoints.
4. Driver management: /api/admin/drivers and admin/drivers exist; passwordHash is removed from responses; existing approval/status/vehicle behavior is preserved.
5. Vehicle category/management: Vehicle CRUD exists at /api/admin/vehicles and /[id], with admin auth and plate uniqueness; archive/status is preferred over destructive deletion.
6. Service category management: pricing profiles/commission routes and admin pricing page exist; Phase 3H will present existing service capabilities without introducing a new public WAV service or re-enabling Children.
7. Booking monitoring: existing admin dashboard/bookings/stats support lifecycle and dispatch state; Phase 3H adds bounded operations queries.
8. Marketing content: no CMS model/route was found; the existing public content is code/catalog based, so Phase 3H reports this as pre-existing static content and does not invent an unsafe HTML CMS.
9. Dispatch/admin fallback: automatic-dispatch.ts exposes start/advance/recovery primitives; Phase 3H retry calls those primitives only.
10. Driver presence/location: Driver fields, DriverLocation, driver-state freshness, and tracking route exist; operations uses central presence rules and bounded admin-only projections.
11. Phase 3F scheduled rides: scheduled marketplace/jobs/readiness/release primitives exist; operations reads authoritative pickupAt, booking, dispatch and outbox state.
12. Phase 3G ledger: DriverLedgerEntry, earnings service/API exist; Phase 3H support view is read-only.
13. Outbox/notifications/realtime: OutboxEvent, writeOutboxEvent, Socket.IO signal/refetch and notification helpers exist; admin UI treats realtime as invalidation only.
14. Existing admin audit/history: no append-only AdminAuditEvent model or equivalent was found; Phase 3H adds a minimal append-only model.
15. Manual assignment/reassignment: existing admin PATCH can assign but lacks operations-grade eligibility/audit; Phase 3H adds a canonical transactional assignment service and endpoint.
16. Cancellation/status mutations: existing admin PATCH remains compatibility behavior; Phase 3H adds no force-status editor and no new refund/compensation policy.
17. Operational indexes: existing status, driverId, pickupAt, dispatch, RideRequest, Driver presence, Outbox, and DriverLedger indexes are reused; AdminAuditEvent gets target/time and admin/time indexes.
18. Multi-city/market fields: Booking.marketTimezone and service/location fields exist; APIs expose marketTimezone and do not hardcode coordinates.
19. Localization/accessibility: admin uses existing LanguageContext/catalogs and Tailwind UI; new operations strings are added EN/SK/DE/UK with semantic/focus/responsive controls.
20. Production compatibility risks: additive audit collection/indexes, unique request keys, historical booking/driver privacy, and production index preflight are documented; no production query/sync is run.

## Final Phase 3H architecture before implementation

- Admin operations API is server-authoritative and bounded:
  GET /api/admin/operations/overview
  GET /api/admin/operations/rides
  GET /api/admin/operations/drivers
  GET /api/admin/operations/scheduled
  GET /api/admin/operations/audit
  GET /api/admin/operations/alerts
  GET /api/admin/operations/ledger
  POST /api/admin/operations/dispatch/retry
  POST /api/admin/operations/assign
  POST /api/admin/operations/release
- All routes call authorizeAdmin; mutations also enforce Phase 3A CSRF/Origin through that helper, validate Zod input, derive adminId from auth.actor.id, require bounded reason/idempotency where high impact, and return machine-readable codes.
- Operations services derive overview/alerts from current Booking, RideRequest, Driver, OutboxEvent, scheduled and ledger state. Alerts are derived, deduplicated in memory per response, and resolve naturally.
- Retry dispatch delegates to startAutomaticDispatch or startScheduledRecoveryDispatch. Assignment uses one Prisma transaction, CAS on unassigned Booking, existing driverCompatibility/scheduled feasibility, stale offer cleanup, deterministic request idempotency, OutboxEvent, and AdminAuditEvent.
- Safe release is limited to future scheduled marketplace assignments and delegates releaseScheduledAssignment; no generic unassign or lifecycle status editor exists.
- Admin UI extends the existing /admin portal with an Operations page and navigation link. It refetches after bounded realtime invalidation/debounced refresh; sockets never mutate state.
- Ledger support is read-only and excludes metadata/passenger PII. Map is not added because the table/list architecture is authoritative and a new map architecture would add unnecessary cost.
- Audit events are append-only and include actor, action, target, bounded sanitized reason, request key, outcome, safe metadata, and timestamp.
