# PHASE 3L IMPLEMENTATION CHECKLIST — Redis-Backed Distributed Auth Rate Limiting

Legend: `[x]` verified by implementation/test evidence; `[MANUAL]` requires staging/operator evidence; `[BLOCKED]` is unresolved; `[ ]` not yet verified.

## Baseline and safety
- [x] Verify expected branch and ancestry.
- [x] Preserve all Phase 3K/3L audit artifacts and unexpected-change safety.
- [x] No Prisma push, migration, seed, production Redis/database/provider write, deploy, commit, push, or merge during this gate.
- [x] Create implementation branch `phase-3l-redis-auth-rate-limiting` only after clean source baseline.

## Redis reuse and server boundary
- [x] Reuse existing Phase 3D Redis factory/config/TLS/auth/reconnect behavior.
- [x] No independent Redis package, URL, client per request, or second subsystem.
- [x] Redis code remains server-only; no secret exposure through NEXT_PUBLIC, bundles, responses, or logs.
- [x] Next.js protected routes use Node-compatible runtime.

## Privacy-safe keying and namespace
- [x] Dedicated `AUTH_RATE_LIMIT_KEY_SECRET` is server-only and documented in `.env.example` with safe placeholder.
- [x] HMAC keys are deterministic, domain-separated, versioned, and contain no plaintext phone/email/IP/password/OTP/reset/JWT/session values.
- [x] Redis namespace is isolated from Socket.IO, BullMQ, outbox, notifications, and realtime recovery.
- [x] Redis values contain only ephemeral counters/cooldown markers.

## Atomic primitives and policies
- [x] Canonical Lua counter increments and sets/repairs bounded TTL atomically.
- [x] Lua result supplies allow/deny, remaining/usage if needed, and bounded retry-after.
- [x] Atomic resend cooldown allows one concurrent logical resend.
- [x] Phase 3J thresholds remain unchanged: OTP send 3/5m, resend 30s, OTP verify 5/5m, login 5/15m, reset 5/15m.
- [x] OTP send enforces shared IP and normalized-phone limits before Twilio.
- [x] OTP verify enforces shared phone/IP limits before Twilio Verify.
- [x] Password login enforces shared IP and normalized identifier limits without account enumeration.
- [x] Password reset enforces shared IP and normalized email limits without enumeration.
- [x] No unlimited local fallback remains production authority; Redis failure is fail-closed.
- [x] Redis errors/timeouts/Lua errors are sanitized and return generic temporary-unavailable behavior.
- [x] HTTP 429 and bounded Retry-After behavior is consistent and generic.

## Flow preservation
- [x] Twilio Verify WhatsApp remains provider authority; no SMS fallback or local OTP authority.
- [x] Returning mobile/email password login remains password-only.
- [x] Forgot Password remains email-only.
- [x] Session format, authVersion, cookies, CSRF/origin, server identity, and password hashing remain unchanged.
- [x] Existing API payload/error compatibility is preserved where allowed.
- [x] Legacy/deprecated auth callers in approved scope are reviewed without expanding unrelated throttling.

## Observability and configuration
- [x] Safe rate-limit denied/backend-unavailable/fail-closed hooks contain no PII or secrets.
- [x] Required production configuration and HMAC-secret failure behavior are documented.
- [x] No provider configuration or production Redis changes are made.

## Tests
- [x] Create `scripts/phase3l-check.cjs` and `npm run test:phase3l`.
- [x] Cover canonical client reuse/no per-request connections.
- [x] Cover HMAC secret/key privacy/domain separation and no secret reuse.
- [x] Cover all five limiter domains, normalization, bounded TTL, Lua atomicity, concurrency, multi-instance simulation, and cooldown race.
- [x] Cover denied OTP send/verify provider protection and denied reset email protection.
- [x] Cover Redis unavailable/timeout/Lua error fail-closed behavior.
- [x] Cover 429/Retry-After and enumeration-safe login/reset.
- [x] Cover Twilio Verify/WhatsApp/no-SMS, returning login, email-only reset, no schema diff, namespace isolation, client boundary, Node runtime, and thresholds.
- [x] Run Phase 3L and all required Phase 3A–3J/UX1 regressions.
- [x] Run Prisma validation/generation, TypeScript, lint, diff check, and production build.
- [MANUAL] Real two-instance Redis staging, outage/reconnect, provider delivery, login, and reset tests remain deployment evidence.

## Artifacts and release status
- [x] Create `PHASE_3L_FINAL_RELEASE_REPORT.md` with exact A–AT headings.
- [x] Complete this checklist with evidence-based statuses.
- [x] Preserve architecture/checklist and all Phase 3K artifacts.
- [x] No commit, push, merge, or deploy.
