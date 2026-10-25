# PHASE 3L REDIS RATE-LIMIT ARCHITECTURE

Architecture and audit only. This document proposes the implementation contract; it does not modify application source, Prisma, Redis, providers, or deployment state.

## A. PHASE 3L ARCHITECTURE STATUS

**PASS for architecture review.** The design below is specific enough to implement with the existing Phase 3D Redis infrastructure. Phase 3L itself performs no implementation, production Redis write, deployment, or commit. The Phase 3K production blocker remains open until this design is implemented and proven in two-instance staging.

## B. BASELINE / GIT STATUS

- Expected branch: `phase-3k-production-readonly-audit`.
- Verified ancestor: `79e7d8d Add Twilio WhatsApp OTP and repair passenger auth recovery`.
- Phase 3K artifacts remain uncommitted and are preserved.
- No reset, rebase, merge, source modification, commit, push, deploy, Prisma operation, or Redis operation was performed.

## C. CURRENT RATE-LIMIT IMPLEMENTATION

`lib/rate-limit.ts` has one process-local `Map<string, { count, resetTime }>`.

- `withRateLimit` derives a key as `${ip}:${scope || pathname}` and increments before the handler.
- IP is selected from the first `x-forwarded-for` value, then `x-real-ip`, then `unknown`; there is no trusted-proxy validation, canonical IP parser, or HMAC derivation.
- `consumeRateLimit` accepts caller-built keys. Phase 3J OTP callers currently include normalized phone text directly in those keys.
- A window is represented by an in-memory `resetTime`; expired records are removed lazily and by a ten-minute cleanup interval. There is no durable Redis TTL.
- A process restart loses all counters. Separate Node processes, web instances, hosts, and autoscaled replicas do not see one another's counters.
- Current approved policies are OTP send IP max 3/5 minutes, OTP send phone max 3/5 minutes, OTP verify phone max 5/5 minutes, password login IP max 5/15 minutes, and password-reset email request IP max 5/15 minutes. The file also contains legacy/deprecated OTP/reset scopes.
- Registration resend cooldown is a database read of the latest unused OTP and a 30-second comparison. It is not a shared atomic reservation; two instances can both pass the read before either creates a record.
- The wrapper adds `X-RateLimit-*` headers and returns status 429 with a generic message and `retryAfter` seconds. The new helper must preserve this safe shape.

## D. CURRENT PROCESS-LOCAL FAILURE MODE

Two requests can be accepted by different web processes because each process has its own map. A phone can therefore obtain more than three OTP sends by rotating instances, and a bot can distribute login/reset attempts across hosts. A restart clears all windows. The raw normalized phone in a caller key would also expose identity if copied into Redis. Blindly accepting a client-supplied `x-forwarded-for` lets an attacker create arbitrary IP buckets. The Phase 3K production blocker is precisely the absence of shared durable enforcement.

## E. EXISTING PHASE 3D REDIS ARCHITECTURE

- `lib/realtime/redis.ts` is the single Redis URL/TLS policy: `REDIS_URL`, `assertProductionRedis()`, ioredis, `rediss://` required when `NODE_ENV=production`, `enableReadyCheck`, `lazyConnect`, `maxRetriesPerRequest: null`, connection names, sanitized error logging, and `closeRedis`.
- `createRedisConnection(role)` is role-labelled but currently creates a client per call; it is used by the Socket.IO server, BullMQ queues, and worker emitter. There is no general-purpose memoized application client exported for request handlers.
- Socket.IO uses two connections (`socket-pub`, `socket-sub`) and the Redis adapter. BullMQ queues use role connections for outbox, offer-expiry, and scheduled rides with bounded retries/backoff. Outbox relay and realtime recovery use those queues and their existing names.
- The repository has one Redis package (`ioredis`) and one URL convention (`REDIS_URL`). No auth limiter client, namespace, or script exists yet.

## F. PROPOSED REDIS REUSE MODEL

Extend the existing `lib/realtime/redis.ts` capability rather than creating a second subsystem. Add a memoized, lazily connected role such as `auth-rate-limit` through the same `assertProductionRedis`, TLS, authentication, lifecycle, error sanitization, and shutdown path. The future `lib/rate-limit.ts` calls this shared helper; it does not instantiate ioredis directly and does not parse a second URL.

The role is a separate logical client connection only where ioredis/BullMQ lifecycle requires it; it is not a second Redis service or configuration. If the implementation can safely share one existing client, it may do so, but it must retain the same lifecycle and avoid publishing/subscribing on the Socket.IO or BullMQ connections. No new package, provider, URL, queue, adapter, or rate-limit service is justified.

## G. PRIVACY-SAFE KEY DESIGN

Use a server-secret HMAC with domain separation, for example:

```text
HMAC-SHA256(AUTH_RATE_LIMIT_KEY_SECRET, "drivo-auth-rate:v1|<domain>|<dimension>|<canonical-value>")
```

`AUTH_RATE_LIMIT_KEY_SECRET` is a dedicated server-only secret, at least 32 random characters in production, and must never be public. Never log the message, digest, or source value.

Canonical values:

- phone: `normalizePassengerPhone` output, validated E.164;
- email: `normalizePassengerEmail` output (trimmed/lowercase);
- IP: a validated address returned by the trusted-proxy resolver, or the bounded sentinel `unknown` when no address is safely available;
- purpose: fixed allowlisted values such as `registration`, `verify`, `login`, and `password-reset`.

Redis keys are:

```text
drivo:auth:rate:v1:<domain>:<dimension>:<hmac-hex>
drivo:auth:cooldown:v1:otp:<hmac-hex>
```

Keys contain only fixed labels and 64-hex HMAC output. They contain no phone, email, password, OTP, reset token, JWT, session ID, booking ID, or arbitrary user string. Plain SHA-256 of a phone is not acceptable because phone-space enumeration is cheap.

## H. OTP SEND LIMIT DESIGN

Apply one atomic policy to the active `POST /api/otp/send` flow after parsing/validating the phone and before provider or database work:

| Dimension | Key | Limit | TTL | Semantics |
|---|---|---:|---:|---|
| normalized phone | `registration-otp-send:phone` | 3 | 5 minutes | shared across every web instance and booking |
| trusted source IP | `registration-otp-send:ip` | 3 | 5 minutes | prevents one IP requesting unlimited numbers |
| resend cooldown | `otp-resend:<phone+purpose>` | one reservation | 30 seconds | shared across instances; purpose is allowlisted |

The phone bucket and IP bucket preserve Phase 3J thresholds. A phone bucket is intentionally global across bookings so rotating booking IDs cannot bypass the number limit. The cooldown is per canonical phone and purpose; if exact booking-scoped compatibility is required, retain the global phone bucket and add a booking-scoped HMAC as a secondary cooldown key under owner review.

The atomic operation returns one generic result: allowed, rate-limited with the shortest safe retry time, or Redis unavailable. A blocked request does not call Twilio. A provider failure still consumes the attempted send reservation, preventing immediate abuse retries; this behavior must be covered by tests.

## I. OTP RESEND COOLDOWN DESIGN

Use the same atomic script as the send reservation, with a dedicated cooldown key and `SET key value NX EX 30` semantics inside the script. Do not perform `GET` followed by `SET`. Requests arriving at instances A, B, and C race on one key; exactly one obtains the reservation and the others receive 429 with a generic 30-second-or-less `Retry-After`.

The cooldown is abuse protection only. The database OTP metadata remains the application record and Twilio Verify remains the code authority. Redis never stores a code or provider response.

## J. OTP VERIFY LIMIT DESIGN

For `POST /api/otp/verify`, check separate HMAC keys for trusted IP and canonical phone, each max 5 in 5 minutes, before calling Twilio Verify. The same policy applies to invalid and valid submissions, preserving the existing request-based Phase 3J behavior and preventing a caller from probing whether a phone exists. Redis only limits abuse; Twilio Verify `approved` remains the verification authority. Never include the submitted six-digit code in a key, value, log, metric, or error.

Legacy `/api/passenger/login/otp/send` and `/api/passenger/login/otp/verify` routes are still actual callers in the tree but are not the active UI architecture. They must remain deprecated/isolated and, if retained, use the same shared limiter without reintroducing local OTP authority or SMS fallback.

## K. PASSWORD LOGIN LIMIT DESIGN

For `POST /api/passenger/login/password`, atomically check two independent dimensions before passenger lookup:

| Dimension | Limit | TTL | Key |
|---|---:|---:|---|
| canonical identifier (email or phone) | 5 requests | 15 minutes | `login:identifier:<HMAC>` |
| trusted source IP | 5 requests | 15 minutes | `login:ip:<HMAC>` |

Both buckets count requests, including successful authentication, and are not reset on success. This is explicit and deterministic, preserves the existing request-based IP semantics, and prevents success responses from becoming a side channel. A successful request still receives the normal 200/session response until a bucket is exhausted. Identifier derivation uses the same canonical phone/email interpretation as login; malformed identifiers use only the IP bucket and retain the existing generic 401 response.

A rate-limited response is always the same generic 429 shape regardless of whether the identifier maps to an account. The limiter runs before account lookup and does not expose which dimension blocked the request.

## L. PASSWORD RESET LIMIT DESIGN

For the active email-only `POST /api/passenger/password-reset/email`, atomically check:

- canonical email HMAC: 5 requests per 15 minutes;
- trusted source IP HMAC: 5 requests per 15 minutes.

The operation happens before the passenger lookup. Existing and nonexistent emails consume the same policy and receive the same generic success response when allowed. A 429 or Redis-unavailable response is also account-independent. No phone, WhatsApp, SMS, or reset token is introduced. The reset completion route remains separately rate-limited and may use a purpose-specific attempt key; it must not weaken the email-request policy.

Actual project callers that must be reviewed with this integration are `/api/passenger/password-reset/complete`, the deprecated `/send` and `/verify` reset shims, and any route that still imports the old wrapper. The active UI remains email-only.

## M. IP / PROXY TRUST MODEL

The current first-value `x-forwarded-for` behavior is unsafe when the app is directly reachable because a client can spoof it. Production must terminate TLS at a known reverse proxy, bind the web process privately, and have the proxy overwrite (not append to) the client-IP header.

Implement one resolver in `lib/rate-limit.ts` (or a small adjacent helper) with this contract:

1. If the deployment explicitly trusts a configured proxy hop count/CIDR, parse the right-to-left chain and select the first untrusted address after removing trusted hops.
2. Otherwise use framework/socket request metadata when available; do not trust arbitrary `x-forwarded-for` or `x-real-ip`.
3. Validate IPv4/IPv6 syntax, normalize it, and map invalid/missing values to `unknown`.
4. Never log the address or use it as a raw Redis key.

Recommended non-secret deployment settings are `DRIVO_TRUSTED_PROXY_COUNT` (default `0`) and, where needed, `DRIVO_TRUSTED_PROXY_CIDRS`. The proxy contract and values require deployment-owner verification. If all clients collapse to `unknown`, identity limits still operate but the IP dimension becomes a shared fail-safe bucket; alert on that condition.

## N. ATOMIC REDIS OPERATIONS

Use a versioned Lua script loaded through the shared ioredis client. The script receives distinct keys and policy arguments; it does not create one ambiguous counter. For each counter it:

1. reads the current integer;
2. rejects when the current value is already at the policy maximum;
3. increments only when allowed;
4. applies `EXPIRE`/`PEXPIRE` when the key is first created and repairs a missing TTL atomically;
5. sets cooldown with `SET ... NX EX` semantics in the same script when required;
6. returns `allowed | limited | cooldown | unavailable` plus a bounded retry seconds value.

This prevents `INCR` succeeding while `EXPIRE` is lost and prevents GET-then-SET cooldown races. A request uses one atomic EVAL/EVALSHA round trip for all dimensions in that policy. The implementation may use `SCRIPT LOAD` during process initialization and `EVALSHA` thereafter, with an `EVAL` fallback on `NOSCRIPT`; script loading is not a production data write and must be handled by the client lifecycle, not by a separate service. Never use `KEYS`, `SCAN`, `FLUSHDB`, transactions that span unrelated namespaces, or read-modify-write sequences in the request path.

## O. TTL DESIGN

Every temporary key has a bounded TTL:

| Domain | TTL |
|---|---:|
| OTP send phone/IP | 300 seconds |
| OTP resend cooldown | 30 seconds |
| OTP verify phone/IP | 300 seconds |
| password login identifier/IP | 900 seconds |
| password-reset email/IP | 900 seconds |

TTL is set in the same atomic operation as the counter. There are no permanent counters and no cleanup job requirement. A versioned namespace allows future policy changes without touching old keys; old keys expire naturally.

## P. REDIS OUTAGE / FAILOVER POLICY

Redis is a security dependency for these controls. For unreachable, timed-out, or reconnecting Redis, the policy is explicitly **FAIL CLOSED** for all four sensitive endpoint families:

- OTP send: do not call Twilio; return generic 503 `AUTH_RATE_LIMIT_UNAVAILABLE`.
- OTP verify: do not call Twilio Verify; return generic 503 with no provider detail.
- Password login: do not query credentials or create a session; return generic 503.
- Password reset: do not look up an account or send mail; return generic 503 that is identical for existing and nonexistent email.

No process-local fallback is enabled in production because it would be mistaken for distributed enforcement. A bounded local fallback may exist only in explicitly non-production development tests and must be labelled, capped, and alerted. Redis reconnecting is treated as unavailable until the atomic command succeeds. The web health/alerting system must page on sustained fail-closed events so availability impact is visible.

## Q. OBSERVABILITY / PRIVACY

Emit structured events without PII:

- `auth_rate_limit_block_total{domain,dimension}`;
- `auth_rate_limit_redis_error_total{operation,error_class}`;
- `auth_rate_limit_command_duration_ms{domain}`;
- `auth_rate_limit_fail_closed_total{domain}`;
- `auth_rate_limit_unknown_ip_total`.

Do not use phone, email, IP, OTP, token, session, booking, or account IDs as metric labels. Logs contain event type, domain, policy version, result, and bounded latency only. Alert on Redis errors/timeouts, fail-closed volume, high blocked-attempt rates, missing TTL responses, and an abnormal `unknown` IP share. Existing realtime `/healthz` remains separate; a web dependency health signal may report only `redisConfigured`, `redisReady`, and sanitized latency/error state.

## R. PHASE 3D COEXISTENCE

The `drivo:auth:rate:v1:*` and `drivo:auth:cooldown:v1:*` prefixes cannot collide with existing BullMQ keys (`bull:*` queue namespaces), Socket.IO adapter channels, outbox event data, or notification/realtime channels. Auth scripts touch only their supplied keys and never inspect or delete other prefixes. The auth client must not publish/subscribe on Socket.IO connections or issue BullMQ queue commands. Existing outbox relay, worker retry, notification delivery, and realtime recovery remain unchanged.

## S. PRISMA / DATABASE IMPACT

**NO Prisma/database schema change.** Redis keys and TTLs are ephemeral; no model, collection, index, migration, backfill, or database write is required for distributed enforcement. Existing OTP metadata remains backward-compatible and continues to store only the `TWILIO_VERIFY` sentinel, not a code. The 30-second database cooldown check may remain as a defense-in-depth check, but Redis becomes the shared atomic gate.

## T. API IMPACT

Replace process-local enforcement at these active routes while preserving payloads and authorization:

- `POST /api/otp/send`: phone/IP limits and shared cooldown before Twilio.
- `POST /api/otp/verify`: phone/IP limits before Twilio Verify.
- `POST /api/passenger/login/password`: identifier/IP limits before account lookup.
- `POST /api/passenger/password-reset/email`: email/IP limits before account lookup.

Review actual additional callers: passenger login step-up OTP send/verify, deprecated phone reset send/verify, password-reset complete, passenger phone resolution/account creation, and driver/admin auth routes. They may share the helper but must retain their existing purpose-specific policies; public booking/contact/rental limits are outside this Phase 3L auth policy. Do not leave an active auth path using a process-local wrapper.

Response contract:

- 429 `RATE_LIMITED` with a generic message and optional integer `retryAfter`/`Retry-After`; do not name the key dimension.
- 503 `AUTH_RATE_LIMIT_UNAVAILABLE` with a generic retry-later message when fail-closed Redis policy applies; no Redis/Twilio error details.
- Existing 401/generic reset-success/OTP error contracts remain unchanged when the limiter allows the request.
- Do not expose counts, Redis status, HMACs, account existence, Twilio status, or provider internals.

## U. UI IMPACT

No UI implementation is required. Existing login, booking OTP, and email-reset pages already handle generic error responses. The server remains authoritative. If `Retry-After` is exposed, the existing OTP UI may show a generic countdown and disable resend until it expires; login/reset UI may show a generic wait message. A client timer is advisory and must never replace the Redis gate. No phone field or WhatsApp reset flow is added.

## V. TWILIO / EMAIL BOUNDARIES

Twilio Verify remains OTP generation, WhatsApp delivery, and approval authority. Redis stores only counters/cooldown markers and never an OTP or Twilio response. No SMS fallback is introduced. Forgot Password remains email-only; Redis does not create phone, WhatsApp, or SMS reset behavior. JWT/session format, `authVersion`, cookie policy, and bcrypt password hashing remain untouched.

## W. TEST ARCHITECTURE

Implementation must add focused tests without changing production data. Minimum scenarios:

1. Same OTP-send phone key across simulated instances shares the limit.
2. Same OTP-send IP key across instances shares the limit.
3. Resend cooldown is shared across instances.
4. Concurrent resend race allows exactly one reservation.
5. OTP verify attempts share the limit.
6. Login identifier attempts share the limit.
7. Login IP attempts share the limit.
8. Password-reset email attempts share the limit.
9. TTL is applied to every temporary key.
10. Expired TTL permits a later request.
11. Raw phone is absent from every Redis key/value/log.
12. Raw email is absent from every Redis key/value/log.
13. OTP is never stored in Redis.
14. Password is never stored in Redis.
15. Redis unreachable follows fail-closed policy for each endpoint.
16. Redis timeout follows the same policy.
17. Successful login handling leaves the documented counters unchanged.
18. Enumeration-safe reset response is preserved for existing and unknown email.
19. Twilio Verify approval/error behavior is unaffected.
20. No SMS fallback is reintroduced; Phase 3J returning login remains compatible.
21. Versioned auth namespace does not collide with Phase 3D BullMQ/Socket.IO/outbox keys.

Unit tests should cover canonicalization/HMAC vectors, policy selection, safe response mapping, TTL calculations, and Lua return codes. Two-process tests must use a real staging Redis; mocked clients cannot prove distributed behavior.

## X. REAL MULTI-INSTANCE REDIS STAGING PLAN

After implementation, provision an isolated staging Redis and two web instances (A and B) using the same `REDIS_URL`, HMAC secret, namespace version, and trusted-proxy configuration. Do not use production.

1. Send OTP on A; repeat from B with the same canonical phone and verify the shared phone/IP limits.
2. Attempt resend on A and immediately on B; B must receive the shared cooldown 429.
3. Start concurrent resend calls against A and B; exactly one must pass the cooldown reservation.
4. Distribute login attempts across A/B; the identifier and IP limits must enforce globally.
5. Distribute password-reset attempts across A/B for both existing and unknown emails; responses remain enumeration-safe.
6. Stop/reconnect Redis in staging and confirm the documented 503 fail-closed behavior and recovery after readiness.
7. Inspect only the auth namespace for bounded TTLs and verify no raw identifiers or OTPs appear.

Record instance IDs, timestamps, Redis version/topology, command latency, results, and sanitized logs.

## Y. LOAD / ABUSE TEST PLAN

In isolated staging, run bounded, rate-controlled bursts for OTP send (many numbers from one IP and many IPs for one phone), password login (one identifier across instances and many identifiers from one IP), and password reset (existing and unknown emails). Keep concurrency and duration explicitly capped. Verify Redis memory, CPU, latency, connection counts, application stability, fail-closed alerts, and recovery. Never load test production.

## Z. CONFIGURATION REQUIREMENTS

Reuse existing names:

- `REDIS_URL` (same single URL; production TLS/auth/private-network policy remains required);
- `AUTH_RATE_LIMIT_KEY_SECRET` (dedicated server-only HMAC input; never public);
- existing `DRIVO_REALTIME_PORT` and `DRIVO_REALTIME_ALLOWED_ORIGINS` remain unrelated realtime settings.

Recommended additional non-secret proxy settings, only if deployment needs them: `DRIVO_TRUSTED_PROXY_COUNT` and/or `DRIVO_TRUSTED_PROXY_CIDRS`. No new Redis URL, public key, or credential is introduced. No production configuration is changed in Phase 3L.

## AA. FOLDER STRUCTURE

Keep the implementation minimal:

- extend `lib/realtime/redis.ts` with the shared/memoized auth-rate-limit client capability;
- keep policy definitions, key derivation, IP resolver, response mapping, and limiter facade in `lib/rate-limit.ts`;
- place versioned Lua source beside the limiter (for example `lib/auth-rate-limit-script.ts`) only if embedding in `lib/rate-limit.ts` would harm reviewability;
- add focused unit/script tests under `scripts/phase3l-check.cjs` and, if needed, a non-production Redis integration test; do not add a second service or excessive folders.

No file above is modified or created as implementation in this gate.

## AB. IMPLEMENTATION ROADMAP

1. Expose the shared Redis capability through the existing helper and lifecycle.
2. Add domain-separated HMAC key derivation and canonical input/IP resolution.
3. Implement versioned atomic limiter primitives with bounded TTL and safe result mapping.
4. Integrate OTP send and shared resend cooldown while preserving Phase 3J thresholds.
5. Integrate OTP verify before Twilio Verify.
6. Integrate identifier/IP password-login limits.
7. Integrate email/IP password-reset request limits and review legacy callers.
8. Add fail-closed outage behavior, Retry-After mapping, metrics, and alerts.
9. Add unit, Lua, two-instance, outage, privacy, and namespace tests.
10. Run the full Phase 3J and earlier regression suites plus static/build gates.

No roadmap step was executed here.

## AC. ROLLBACK STRATEGY

Rollback is an application/configuration action, not a user-data deletion. Stop the rollout, restore the prior reviewed application artifact, and preserve the same Prisma/database state. Existing `drivo:auth:rate:v1:*` keys are ephemeral and may expire naturally; never run `FLUSHDB` or delete another subsystem's keys. A controlled namespace cleanup may delete only known auth-rate keys if an operator explicitly approves it, but cleanup is not required for rollback.

A rollback to the Phase 3J application restores process-local behavior and therefore reopens the Phase 3K distributed-limiter blocker; record that risk and keep the feature out of production until reimplemented. The existing Twilio Verify, email reset, session, cookie, authVersion, and password-hash contracts remain compatible because no schema or provider state changed.

## AD. PRODUCTION READINESS IMPACT

This architecture directly addresses Phase 3K blocker 3: process-local auth limits are bypassable across multiple app instances. It does not close Mongo topology/transaction evidence, backup/restore, production duplicate/index preflights, pricing verification, SMTP/Twilio/Google/Stripe configuration, real provider delivery, Redis HA/private-network evidence, Socket.IO proxy evidence, race/E2E/mobile/browser staging, observability ownership, or historic Mongo credential rotation. Phase 3L alone does not make production GO.

## AE. FILES CREATED

Created as architecture artifacts only:

- `PHASE_3L_ARCHITECTURE_CHECKLIST.md`
- `PHASE_3L_REDIS_RATE_LIMIT_ARCHITECTURE.md`

Preserved all existing Phase 3K and production-readiness artifacts. No application source file was changed.

## AF. git status --short

The final status should contain only the existing Phase 3K/production-readiness markdown artifacts plus these two Phase 3L documents. No source or generated application file should be modified.

```text
?? PHASE_3K_CHECKLIST.md
?? PHASE_3K_PRODUCTION_READ_ONLY_AUDIT_REPORT.md
?? PHASE_3K_PROVIDER_READINESS_MATRIX.md
?? PHASE_3K_SCHEMA_INDEX_MATRIX.md
?? PHASE_3L_ARCHITECTURE_CHECKLIST.md
?? PHASE_3L_REDIS_RATE_LIMIT_ARCHITECTURE.md
?? PRODUCTION_READINESS_CHECKLIST.md
?? PRODUCTION_READINESS_GATE_REPORT.md
```

PHASE 3L ARCHITECTURE GATE: PASS
