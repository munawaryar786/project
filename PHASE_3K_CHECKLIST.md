# PHASE 3K CHECKLIST — Production Read-Only Audit & Infrastructure Evidence

Legend: `[x]` verified with evidence; `[BLOCKED]` production blocker found; `[MANUAL]` requires an approved operator/provider/staging procedure; `[ ]` not yet verified.

## 1. Mandatory scope and safety

- [x] Read-only audit scope recorded.
- [x] No application feature implementation.
- [x] No database write, index creation, Prisma push, migration, seed, DDL, schema synchronization, or backfill.
- [x] No main merge, deploy, service restart, Twilio/SMTP/Redis/Google/Stripe change, or credential rotation.
- [x] Unknown evidence is classified manually or blocked; nothing is guessed.

## 2. Baseline and branch

- [x] Verify current branch is `phase-3j-twilio-whatsapp-auth-recovery` before audit.
- [x] Verify HEAD is `79e7d8d Add Twilio WhatsApp OTP and repair passenger auth recovery`.
- [x] Verify ancestry includes `79e7d8d`, `05c6153`, `9d8db4c`, and approved Phase 3A–3H history.
- [x] Record `git status --short` and `git log --oneline --decorate -15`.
- [x] Preserve existing `PRODUCTION_READINESS_GATE_REPORT.md` and `PRODUCTION_READINESS_CHECKLIST.md`.
- [x] Create `phase-3k-production-readonly-audit` only when there are no unexpected source changes.
- [x] Do not merge, rebase, reset, delete, overwrite, or hide existing work.

## 3. Production access and secret/PII handling

- [MANUAL] Determine whether safe, authorized production access is actually available.
- [x] Inspect configuration names only; never print URI/password/token/key/secret/OTP/reset token/password.
- [x] Never print passenger phones, emails, names, or addresses.
- [MANUAL] If production access cannot be proven, do not connect and mark applicable items `[MANUAL]`.
- [x] Return customer audits only as safe aggregate counts.

## 4. Technology and topology

- [x] Confirm repository/runtime uses MongoDB + Prisma 6.
- [x] Confirm no PostgreSQL migration in this release.
- [MANUAL] If authorized, run only safe Mongo topology/read-only status (`hello` equivalent).
- [MANUAL] Record replica set/managed cluster indication, writable primary capability, logical sessions, transaction compatibility, and safe server version.
- [MANUAL] If topology permission is unavailable, classify `[MANUAL]`.
- [BLOCKED] Classify transaction support for offer acceptance, dispatch, scheduled claim, manual assignment, completion, and ledger without a write test.

## 5. Backup and restore

- [MANUAL] Identify managed provider or self-hosted deployment.
- [MANUAL] Record automatic backup availability, latest snapshot evidence, retention, restore mechanism, PITR, and restore-test history.
- [x] Do not create or delete backups.
- [MANUAL] If provider console is unavailable, classify `[MANUAL]`.
- [x] Document controlled procedure: backup/snapshot → verify success → timestamp → schema/index change → app deployment → smoke test.
- [x] Document separate application rollback and database restore/index rollback; Git rollback alone is insufficient.

## 6. Prisma collections and schema/index mapping

- [x] Inspect `prisma/schema.prisma` and document exact mappings for PricingSettings, PricingTier, RideRequest, Passenger/User, EmailDelivery, OutboxEvent, Notification, DriverLedgerEntry, AdminAuditEvent, and scheduled-ride models.
- [x] Produce exact Phase 3B–3J schema/index delta table with phase, model/collection, field/index, current evidence, required state, preflight, backfill, risk, and later action.
- [x] Identify each required backfill as none, optional compatibility, derived backfill, or manual remediation.
- [x] Do not synchronize schema/indexes.

## 7. Pricing production audits

- [MANUAL] Read only `PricingSettings` logical key `default` when authorized.
- [x] Compare baseFare 0, distanceRate 1, minimumFare 12.5, waitingRatePerMinute 0.25, bookingFee 0, surgeEnabled false.
- [MANUAL] Classify PricingSettings PASS/MISMATCH/MISSING/MANUAL.
- [MANUAL] Read only active/default PricingTier rows.
- [MANUAL] Compare 0–50 km EUR 1.00/km, 50–100 km EUR 0.90/km, 100+ km EUR 0.85/km.
- [x] Do not change pricing rows.
- [x] Verify authoritative regression: 10→12.50, 12.5→12.50, 20→20.00, 50→50.00, 75→72.50, 100→95.00, 101→95.85, 136→125.60, 200→180.00 before approved additions.
- [x] If production differs, record deployment blocker and do not modify it.

## 8. Duplicate and identity preflights

- [MANUAL] Read-only RideRequest duplicate aggregate for `bookingId + driverId`: total count, duplicate logical groups, documents involved; no identifiers.
- [x] If duplicates exist, mark schema/index synchronization blocked; do not delete.
- [MANUAL] Audit normalized-equivalent passenger phone collisions using Phase 3J canonical interpretation; return total accounts, usable phones, collision groups, documents involved only.
- [x] If canonicalization cannot be safely run, prepare a local/read-only aggregate-only procedure; do not execute a writer.
- [MANUAL] Audit trimmed/lowercase canonical passenger email collisions; return aggregate counts only; do not merge accounts.
- [x] If identity collisions exist, record index/synchronization blocker.
- [MANUAL] Inspect EmailDelivery collection, idempotency field, unique index, normal indexes, optional/default fields; return document count, duplicate idempotency groups, index compatibility, no recipients.
- [x] Do not create indexes.

## 9. Current production index evidence

- [MANUAL] Where authorized, inspect read-only index metadata for Phase 3B–3J affected collections.
- [x] Document required indexes as existing, missing, or conflicting.
- [x] Do not create or drop indexes.

## 10. Redis and auth rate limiting

- [x] Inspect Redis variable names and expected configuration only.
- [MANUAL] Record configured status, TLS/auth expectation, private/public networking, provider/type, HA/persistence evidence when visible; never print URL/password or write keys.
- [x] Audit Phase 3J limiter coverage for OTP send, resend cooldown, OTP verify, password login, and password-reset request.
- [x] Classify each limiter process-local, shared/durable, or Redis-backed.
- [BLOCKED] If multi-instance traffic can bypass process-local controls, mark production blocker and recommend a dedicated fix phase; do not fix in Phase 3K.

## 11. Provider configuration evidence

- [x] Twilio names-only status for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`; verify Verify + WhatsApp source channel; no provider call/change; real delivery remains staging.
- [x] SMTP names-only status for `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_BOOKING_EMAIL`, `PUBLIC_SITE_URL`; real email remains staging.
- [x] Identify exact Google Maps/Routes env names; assess browser/server keys, domain/API restrictions, billing, quota; mark unavailable evidence `[MANUAL]`.
- [x] Stripe names-only status for server secret, public key, webhook secret, success/cancel/public URL dependencies; verify signature validation and server-authoritative amount; provider/account mode may be `[MANUAL]`.
- [x] Create one Google/Stripe/Twilio/SMTP matrix with required config, source integration, name presence, real integration test, and blocker.

## 12. Realtime, proxy, workers, outbox

- [x] Audit realtime server process, Socket.IO path, Redis adapter, worker process, and PM2/process-manager definitions.
- [x] Determine expected production process list; do not restart anything.
- [MANUAL] Inspect proxy config if available; verify `/socket.io/` WebSocket upgrade headers; otherwise `[MANUAL]`.
- [x] Verify source BullMQ, outbox relay, retry, recovery, and worker configuration; separate runtime verification.
- [x] No Redis writes.

## 13. Historic credential and operations

- [x] Do not print or revoke the historic Mongo credential during Phase 3K.
- [x] Document rotation: create replacement → least privilege → update web → update realtime/worker → verify connectivity → verify health → revoke old → monitor.
- [x] Classify rotation as deployment prerequisite.
- [MANUAL] Record observability/health evidence or `[MANUAL]` for web, Mongo, Redis, workers, SMTP/EmailDelivery, Twilio, dispatch, payments, and realtime.

## 14. Regression and static gates

- [x] Run all required `test:phase3j`, `test:phase3i`, `test:homepage-priority`, `test:phase3h`, `test:phase3g`, `test:phase3f`, `test:phase3e`, `test:phase3d`, `test:phase3c`, `test:phase3b`, `security:phase3a`, and `test:ux1` commands; all must pass.
- [x] Run `git diff --check`, `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit --pretty false`, and `npm run lint`.
- [x] Run platform-safe build equivalent to `NODE_OPTIONS=--max-old-space-size=4096 npm run build`; existing middleware deprecation warning alone is not a blocker.

## 15. Evidence boundaries and staging requirements

- [x] Do not claim real Twilio, SMTP/Gmail, Mongo race, Redis reconnect, Socket.IO proxy, Google Routes, Stripe webhook, mobile navigation, or browser E2E without evidence.
- [x] List remaining staging tests: Twilio OTP; returning login; reset email; invoice email; no-driver email; driver-accepted Admin notification; Mongo acceptance race; dispatch decline/expiry; scheduled claim race; concurrent ledger completion; admin assignment race; Redis multi-instance limits; Redis reconnect/outbox recovery; Socket.IO proxy/reconnect; Google route/navigation; Stripe webhook; responsive browser; mobile device; full booking→completion.
- [x] Record every finding as PASS, BLOCKED, MANUAL VERIFICATION REQUIRED, or NOT APPLICABLE.

## 16. Required Phase 3K artifacts and final report

- [x] Create `PHASE_3K_PRODUCTION_READ_ONLY_AUDIT_REPORT.md`.
- [x] Create/update this `PHASE_3K_CHECKLIST.md` without overwriting prior readiness artifacts.
- [x] Optionally create `PHASE_3K_SCHEMA_INDEX_MATRIX.md` and `PHASE_3K_PROVIDER_READINESS_MATRIX.md`.
- [x] Final report uses exact headings A–AH from the brief.
- [x] Final report ends with exactly one gate line: `PHASE 3K READ-ONLY GATE: PASS` or `PHASE 3K READ-ONLY GATE: BLOCKED`.
- [x] Final report then ends with `PHASE 3K AUDIT COMPLETE — AWAITING PROJECT OWNER REVIEW`.
- [x] Do not commit, push, merge, deploy, or perform production writes.
