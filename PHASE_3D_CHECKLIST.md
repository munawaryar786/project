# Drivo Phase 3D Realtime Infrastructure Checklist

## Gate and audit (mandatory before implementation)
- [x] Verify branch `phase-3c-automatic-dispatch`, HEAD `ac75085 Add automatic driver dispatch engine`, and clean worktree.
- [x] Create `phase-3d-realtime-infrastructure` without deleting or overwriting an existing branch.
- [x] Audit package dependencies/lockfile for Socket.IO, Redis, BullMQ, TypeScript runtime and worker tooling.
- [x] Audit existing realtime code and confirm no dedicated realtime process exists.
- [x] Audit Phase 3B `OutboxEvent` fields, writer and domain event producers.
- [x] Audit Phase 3C offer expiry/advance and authoritative assignment paths.
- [x] Audit Phase 3A canonical driver/admin/passenger sessions, Origin and CSRF helpers.
- [x] Document final independent process architecture before implementation.
- [x] Confirm Phase 3E map/navigation/tracking implementation is out of scope.

## Architecture and security
- [x] Dedicated Socket.IO process; do not customize Next.js server.
- [x] WebSocket-only transport on client and server.
- [x] Central Redis configuration using `REDIS_URL`; support `rediss://`; never expose/log secrets.
- [x] Central Redis connection lifecycle, reconnect/error handling and graceful shutdown.
- [x] Allowed Origin validation; no wildcard production Origin.
- [x] Canonical secure session-cookie authentication for `/driver`, `/admin`, `/passenger` namespaces.
- [x] Revocation/authVersion safety and clean machine-readable auth failures.
- [x] Server-owned actor rooms; no arbitrary room join, client IDs, or query-string authority.
- [x] Preserve capability-token tracking security; no anonymous Socket.IO booking room.
- [x] Central sanitized event contracts with stable event IDs and no PII/exact addresses.
- [x] REST remains authoritative; realtime only signals/refetch hints.
- [x] No location streaming, fare logic, navigation, scheduled marketplace, earnings redesign or Phase 3H board.

## Durable outbox and queues
- [x] Minimally extend `OutboxEvent` only if required, with compatibility-safe optional/defaulted fields.
- [x] Central outbox state constants and durable claim/lease/CAS recovery.
- [x] Central BullMQ queue names, deterministic safe job IDs, bounded retry/backoff and inspectable failure state.
- [x] Safe outbox claim -> queue handoff recovery across crashes/Redis failures.
- [x] Idempotent worker side effects and published transition only after success.
- [x] Periodic outbox reconciliation for pending/stale/retryable events.
- [x] Structured secret/PII-free operational logging.

## Domain routing and expiry
- [x] Central domain-event routing for offer, dispatch, booking and trip events.
- [x] OFFER_CREATED notification/realtime delivery and persisted `expiresAt` delayed job.
- [x] Expiry job validates current persisted offer state/time and calls Phase 3C `advanceDispatch()` only.
- [x] Duplicate/late expiry jobs are harmless; no direct assignment or browser timer authority.
- [x] Periodic pending-offer expiry reconciliation catches lost Redis delayed jobs.
- [x] Decline/accept/trip commands remain authenticated REST mutations.

## Persistent notifications
- [x] Audit for existing notification model before adding one.
- [x] Add privacy-safe dedupe-keyed persistent notifications only where necessary.
- [x] Secure driver list/unread/read/mark-all APIs using canonical driver identity.
- [x] Equivalent admin operational notification support without Phase 3H UI.
- [x] Passenger realtime decision documented; no cross-passenger access or insecure anonymous room.
- [x] Notification payloads use type/translation key/safe structured data, no PII/secrets.
- [x] Notification indexes/null compatibility and duplicate-event dedupe covered.
- [x] English/Slovak/German/Ukrainian catalog impact audited.

## Clients and resilience
- [x] Driver realtime signal triggers authoritative offer/trip/notification refetch.
- [x] Admin refresh signals are sanitized and scoped.
- [x] Passenger signals, if enabled, are owner-scoped and REST-refetch based.
- [x] Reconnect performs safe REST refetch; socket loss does not sign actor out.
- [x] Dashboard polling/fallback and understandable connection state.
- [x] Accessible meaningful announcements, semantic controls, focus/touch targets and no GPS spam.
- [x] Health endpoints, worker/realtime logs and graceful shutdown.
- [x] Environment/reverse-proxy/private Redis deployment plan documented; no deployment executed.

## Verification
- [x] Add `npm run test:phase3d` distinguishing static, mocked and local integration evidence.
- [x] Notification privacy/ownership/CSRF tests.
- [x] Socket auth/origin/rooms/namespace/query-string tests.
- [x] Realtime payload/idempotency/refetch/REST-authority tests.
- [x] Outbox claim/queue/retry/lease/idempotency/privacy tests.
- [x] Offer expiry scheduling/authority/reconciliation tests.
- [x] Redis outage/recovery tests.
- [x] Driver dashboard/reconnect/accessibility tests.
- [x] Run Phase 3C, 3B, 3A and UX1 regressions.
- [x] Run diff check, Phase 3D tests, Prisma validate/generate, typecheck, lint and build.
- [x] Prepare read-only production checks without executing them.
- [x] Document production prerequisites, env vars, process topology and risks.
- [x] Leave all Phase 3D changes uncommitted; do not push, deploy, migrate, db-push, seed or write production data.

## Evidence boundary
All code/static checks and local type/build checks were run. Real Redis, Mongo transaction races, staging reverse-proxy, browser reconnect/accessibility, production index inspection and end-to-end multi-process tests were not run and remain deployment prerequisites. No migration, db push, production query, seed, commit, push or deployment was performed.
