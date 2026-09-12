# PRODUCTION READINESS CHECKLIST

## Baseline and Git integrity

- [x] Branch is `phase-3j-twilio-whatsapp-auth-recovery`.
- [x] HEAD is `79e7d8d Add Twilio WhatsApp OTP and repair passenger auth recovery`.
- [x] Ancestry contains approved Phase 3I `05c6153`, homepage `9d8db4c`, and Phase 3A-3H commits.
- [x] Feature source is clean at the recorded baseline; this audit adds report/checklist artifacts only.
- [x] Current feature branch is 46 commits ahead of local `origin/main` and 0 behind; merge-base is `db90c33`.
- [x] No merge, reset, rebase, commit, push, or deployment was performed by this audit.

## Product and architecture regression

- [x] Passenger booking, service selection, passengers, luggage, pickup, destination, quote, confirmation, and authentication surfaces exist.
- [x] Assisted/Accessible, Airport, Standard, Children flag, and WAV surfaces remain present.
- [x] Driver onboarding/state, dispatch, lifecycle, navigation, scheduled marketplace, earnings, and rental surfaces exist.
- [x] Admin ride/driver/category/booking/marketing/operations/assignment/alert/audit surfaces exist.
- [x] Accessibility and localization architecture remain present.
- [x] Multi-city, multi-language, multi-country, fleet/independent-driver, and future WAV extension points remain documented in code/config.

## Automated gates

- [x] `npm run test:phase3j` PASS: 42/42.
- [x] `npm run test:phase3i` PASS: 84/84.
- [x] `npm run test:homepage-priority` PASS: 17/17.
- [x] `npm run test:phase3h` PASS: 146/146.
- [x] `npm run test:phase3g` PASS: 109/109.
- [x] `npm run test:phase3f` PASS: 96/96.
- [x] `npm run test:phase3e` PASS: 61/61.
- [x] `npm run test:phase3d` PASS: 62/62.
- [x] `npm run test:phase3c` PASS: 59/59.
- [x] `npm run test:phase3b` PASS: 67 static + 45 isolated behavioral.
- [x] `npm run security:phase3a` PASS.
- [x] `npm run test:ux1` PASS, including 136 km -> EUR 125.60.
- [x] `git diff --check` PASS.
- [x] `npx prisma validate` PASS.
- [x] `npx prisma generate` PASS.
- [x] `npx tsc --noEmit --pretty false` PASS.
- [x] `npm run lint` PASS.
- [x] `npm run build` PASS; existing middleware deprecation warning only.

## Database and schema readiness

- [ ] Production MongoDB endpoint is not safely verifiable from the current audit environment; no live topology read was performed.
- [BLOCKED] MongoDB replica-set/managed-cluster transaction capability is unproven for acceptance, dispatch, scheduled claim, completion, ledger, and admin transactions.
- [BLOCKED] Production backup/restore evidence is missing: cluster, timestamp, restore validation, retention, and responsible operator are not recorded.
- [ ] PricingSettings production read-only values for key `default` require an approved reporting session; source defaults match the requested target.
- [ ] Production active/default PricingDistanceTier rows require an approved reporting session; seed/source tiers match 0-50/50-100/100+ expected rates.
- [ ] RideRequest `(bookingId, driverId)` duplicate preflight requires production read-only query.
- [ ] Normalized-equivalent passenger phone duplicate preflight requires production read-only query.
- [ ] Normalized passenger email duplicate preflight requires production read-only query.
- [ ] EmailDelivery collection/index/conflict preflight requires production read-only query.
- [x] Schema diff against `prisma/schema.prisma` is empty for Phase 3J.
- [x] MongoDB + Prisma 6 remains the production database technology; no PostgreSQL migration is proposed for this release.
- [x] Phase 3B-3J synchronization plan is documented in the gate report; no synchronization was executed.
- [x] Synchronization sequence is backup -> duplicate/index audits -> approval -> sync -> index verification -> deployment -> smoke tests.

## Schema synchronization inventory

- [x] Phase 3B: Driver location fields, RideRequest unique `(bookingId, driverId)`, and OutboxEvent collection/indexes.
- [x] Phase 3C: no direct Prisma schema delta; uses the Phase 3B foundation.
- [x] Phase 3D: Outbox retry fields/index and Notification collection/indexes.
- [x] Phase 3E: no direct Prisma schema delta; navigation uses existing booking/driver data.
- [x] Phase 3F: Booking `pickupAt`, `marketTimezone`, and pickupAt index.
- [x] Phase 3G: DriverLedgerEntry collection, relations, unique idempotency key, and indexes.
- [x] Phase 3H: AdminAuditEvent collection, relations, unique requestId, and indexes.
- [x] Phase 3I: EmailDelivery collection, unique logicalKey, and status indexes.
- [x] Phase 3J: no schema delta; existing OTP fields remain backward-compatible metadata fields.

## Email, pricing, payments, and notifications

- [ ] SMTP configuration names are not configured in the local audit environment; production values require names-only operator verification.
- [ ] Real password-reset email delivery, public URL, expiry, replay, old-password failure, and new-password success require staging.
- [ ] Real booking invoice email rendering/content requires staging Gmail desktop/mobile verification.
- [x] EmailDelivery logical idempotency for invoice and no-driver escalation is covered by source/regression checks.
- [ ] Driver acceptance -> Admin persistent notification -> realtime -> refetch E2E requires staging.
- [ ] Dispatch exhaustion -> one Admin notification/email, no passenger/driver escalation, manual assignment requires staging.
- [x] Server-authoritative progressive pricing source/regression values are covered; production PricingSettings actuals remain manual verification.
- [x] Distance authority remains pickup -> destination; driver distance is operational only.
- [x] Quote, booking, Stripe amount, and invoice use server-side authority in source/regression checks.
- [ ] Stripe production/test mode, webhook, signature, idempotency, and URLs require names-only/staging verification.

## Twilio, login, and reset readiness

- [ ] Twilio Verify server configuration names are missing/empty in the local environment; production names require operator verification.
- [ ] Real Slovak +421 WhatsApp Verify delivery is not yet tested.
- [x] Active first-time registration uses Verify send/check, WhatsApp only, no local OTP authority, and safe errors.
- [x] Returning mobile/email password login has canonical normalization, generic failures, secure session, and no OTP.
- [x] Forgot Password is email-only; legacy phone reset routes are isolated and non-issuing.
- [ ] Real passenger login/reset E2E requires staging.

## Redis, realtime, and workers

- [ ] Redis production URL/security/Private network/TLS/auth/HA/persistence/limits/reconnect settings require operator verification; local REDIS_URL is empty.
- [BLOCKED] Auth rate limiting is process-memory only; OTP send/resend/verify, login, and reset controls are bypassable across multiple app instances until shared durable Redis limiting is enabled and tested.
- [ ] Socket.IO `/socket.io/` reverse-proxy upgrade/timeouts/persistence require staging/proxy verification.
- [ ] Next.js/web, realtime Socket.IO, BullMQ worker, and any scheduled worker process-manager strategy requires operator verification.
- [ ] Worker restart, Redis reconnect, outbox retry, duplicate delivery, and recovery tests require staging.

## Maps, drivers, and operational races

- [ ] Google browser/server key restrictions, domain/API restrictions, billing, quota, and monitoring require operator verification; local keys are empty.
- [ ] Driver live navigation E2E including stale GPS/provider failure requires mobile staging.
- [ ] Phase 3B accept race requires real Mongo/staging race validation.
- [ ] Phase 3C dispatch expiry/decline/parallel/exhaustion/admin fallback requires staging.
- [ ] Phase 3F scheduled claim/readiness/recovery/cancel/reschedule races require staging.
- [ ] Phase 3G concurrent completion/ledger/reconciliation requires staging/read-only audit.
- [ ] Phase 3H assignment/retry/release races and immutable AdminAuditEvent require staging.

## UX, staging, security, and operations

- [ ] Keyboard/screen-reader/focus/contrast/touch browser checks at 375/768/1440 require browser/mobile staging evidence.
- [ ] Full passenger, operational, no-driver, and scheduled-ride staging flows require execution.
- [x] Children flag source is false in `.env.example`; public feature remains hidden without deleting backend capability.
- [x] Homepage priority is Assisted/Accessible, Airport, Standard; WAV behavior remains present.
- [x] Secure cookies, CSRF, Origin, session signing, authVersion, and secret scans pass source/regression gates.
- [BLOCKED] Historic Mongo credential exposure requires controlled replacement-credential rotation planning before production approval; no revocation was executed.
- [ ] Production observability for app/worker/Redis/Mongo/email/Twilio/dispatch/payment/realtime requires operator sign-off.
- [ ] Health checks for web/database/Redis/realtime/workers require staging/operator verification.
- [x] Controlled deployment, rollback, smoke, resource, and process-restart plans are prepared in the gate report; none were executed.
- [x] No `git reset --hard` is recommended without explicit confirmation that VPS changes may be discarded.

## Decision

- [BLOCKED] Production readiness is NO-GO until unresolved production-critical database transaction/backup evidence, durable shared auth rate limiting, credential/config verification, duplicate preflights, and required staging E2E evidence are completed.
