# PHASE 3L ARCHITECTURE CHECKLIST — Redis-Backed Distributed Auth Rate Limiting

Legend: `[x]` verified with source/evidence; `[MANUAL]` requires later staging/operator evidence; `[BLOCKED]` is a current production blocker; `[ ]` not yet classified. Phase 3L is architecture/audit only.

## Scope and safety
- [x] No implementation or application source modification.
- [x] No database/Redis production write, deploy, commit, push, merge, Prisma push, migration, or seed.
- [x] Reuse existing Phase 3D Redis infrastructure; do not create a second Redis subsystem.

## 1. Baseline
- [x] Verify branch `phase-3k-production-readonly-audit`.
- [x] Verify approved ancestor `79e7d8d Add Twilio WhatsApp OTP and repair passenger auth recovery`.
- [x] Record `git branch --show-current`, `git status --short`, `git log --oneline --decorate -15`.
- [x] Preserve all uncommitted Phase 3K artifacts; no reset/rebase/merge.

## 2. Phase 3K evidence
- [x] Read Phase 3K report, checklist, schema/index matrix, and provider matrix.
- [x] Extract the exact process-local auth-rate-limit blocker.
- [x] Avoid repeating unrelated infrastructure audits.

## 3. Current limiter audit
- [x] Inspect `lib/rate-limit.ts` and every caller for OTP send/verify, password login, password-reset request, and resend cooldown.
- [x] Document storage, key construction, TTL, counters, cooldown, restart reset, multi-process, and multi-server behavior.

## 4. Existing Redis architecture
- [x] Document Redis client creation, lifecycle, singleton behavior, config names, TLS/auth, reconnect, BullMQ, Socket.IO adapter, and general-purpose client availability.
- [x] Do not create new code during this gate.

## 5–6. Reuse and domains
- [x] Design reuse of existing Redis infrastructure and justify any required change.
- [x] Do not introduce another package, connection layer, URL convention, or unrelated service.
- [x] Design separate policies for OTP send, OTP resend cooldown, OTP verify, password login, and password-reset request.

## 7–9. Keys and namespace
- [x] Design HMAC/equivalent non-reversible identifiers; never raw phone/email/password/OTP/reset/JWT/session IDs.
- [x] Avoid plain SHA-256 identifiers without offline-enumeration protection.
- [x] Derive a collision-safe namespace from existing conventions; avoid BullMQ/Socket.IO/outbox collisions.

## 10–14. Limiter policies
- [x] OTP send: phone and appropriate IP limits with current Phase 3J thresholds, TTL, errors, and privacy.
- [x] Resend cooldown: shared atomic operation; no GET-then-SET race.
- [x] OTP verify: shared invalid-attempt abuse protection; Twilio remains authority.
- [x] Password login: identifier and IP brute-force controls, successful-counter behavior, generic account responses.
- [x] Password reset: distributed enumeration-safe request limiting.

## 15–18. IP, atomicity, TTL
- [x] Audit current IP derivation and proxy trust; document spoofing risk and safe source-IP resolution.
- [x] Choose atomic primitives and prevent INCR/EXPIRE TTL-loss races.
- [x] Document Redis commands/round trips per request.
- [x] Give bounded TTLs for every temporary auth key using approved Phase 3J windows.

## 19–23. Outage, fallback, health, security
- [x] Explicitly choose fail-closed/open/bounded-local policy per endpoint for unreachable, timeout, reconnecting Redis.
- [x] If local fallback exists, bound and distinguish it from distributed enforcement and alert on use.
- [x] Design PII-safe health/metrics for Redis failures, limiter failures, and blocked-attempt rates.
- [x] Estimate key cardinality/memory; prevent attacker-controlled arbitrary keys.
- [x] Assume private network, authentication, TLS, restricted access; expose no credentials and configure no production Redis.

## 24–26. Coexistence and topology
- [x] Prove namespace/operations do not interfere with Socket.IO, BullMQ, outbox, notifications, or realtime recovery.
- [x] Account for Next.js web instances, realtime, and worker; only auth-serving web instances invoke limiter.
- [x] Determine whether Prisma/database schema changes are required; preferred result is none and schema must remain unchanged.

## 27–33. API/UI/provider boundaries
- [x] Document affected routes and any additional actual route; preserve API compatibility.
- [x] Define safe status/error contracts with no account/Redis/Twilio disclosure.
- [x] Determine UI impact and safe cooldown/retry handling without implementation.
- [x] Decide whether to expose generic `Retry-After`.
- [x] Keep Twilio Verify generation/delivery/approval authority; never store OTP in Redis.
- [x] Keep forgot-password email-only; do not reintroduce phone/WhatsApp/SMS reset.
- [x] Preserve JWT/session format, authVersion, cookies, and password hashing.

## 34. Test architecture
- [x] Design all 20 minimum scenarios: cross-instance send, shared cooldown, concurrent resend winner, verify/login/reset limits, TTL/expiry, key privacy, no OTP/password storage, outage/timeout policies, successful-login handling, enumeration safety, Twilio/WhatsApp/no-SMS boundary, Phase 3J login compatibility, namespace isolation.

## 35–39. Staging, load, config, rollout, rollback
- [x] Prepare real two-instance Redis staging plan for send/cooldown/login/reset and reconnect policy.
- [x] Prepare bounded staging abuse bursts for OTP/login/reset; never load test production.
- [x] Document existing and any additional non-secret configuration names without values.
- [x] Define rollout: code → Redis connectivity → limiter health → smoke → multi-instance tests → monitoring.
- [x] Define rollback without deleting user data; ephemeral rate keys may expire; preserve Phase 3J compatibility.

## 40–42. Placement and impact
- [x] Propose minimal file placement using existing shared Redis helper and focused tests.
- [x] Provide ten-step implementation roadmap without implementing.
- [x] Explain which Phase 3K blocker closes and all blockers that remain; Phase 3L alone is not production GO.

## 43–44. Artifacts and gate
- [x] Create `PHASE_3L_REDIS_RATE_LIMIT_ARCHITECTURE.md`.
- [x] Use exact final report headings A–AF from the brief.
- [x] End with exactly one architecture gate line and do not commit/push/deploy/implement.
