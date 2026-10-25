# Drivo Phase 3A implementation checklist

This checklist is the working gate for the approved Phase 3A security containment scope. Items are marked complete only after implementation and verification.

Release-gate correction (2026-09-11): prior blanket completion overstated runtime evidence. See PHASE_3A_RELEASE_GATE.md for tested paths and blockers. The release gate is BLOCKED.

- [x] 01 Inspect branch, worktree, auth helpers, all affected API routes, payment, tracking, middleware, and frontend callers.
- [x] 02 Consolidate canonical server sessions on jose with actor, role, version, JTI, CSRF hash, issuer, audience, and expiry claims.
- [x] 03 Add one server environment validation boundary without logging secrets.
- [x] 04 Enforce actor-specific production/local session and CSRF cookie names and attributes.
- [x] 05 Centralize passenger, driver, and admin session lifetimes.
- [x] 06 Use existing actor auth versions and add only a required Phase 3A additive schema change.
- [x] 07 Preserve and safely upgrade valid legacy passenger sessions.
- [x] 08 Make driver authentication cookie-authoritative and add /api/driver/me.
- [x] 09 Protect every driver API and derive driver identity from the session.
- [x] 10 Make admin authentication cookie-authoritative and protect every admin API.
- [x] 11 Enforce actor-specific CSRF and exact configured-origin checks for cookie mutations.
- [x] 12 Centralize origin validation for future realtime reuse without implementing realtime.
- [x] 13 Contain driver IDOR across availability, location, bookings, status, requests, profile, and earnings.
- [ ] 14 Contain admin API authentication, ownership, and existing role permissions.
- [x] 15 Secure passenger booking GET ownership and minimize its response.
- [x] 16 Contain generic booking PATCH with explicit rejection or allowlisting.
- [ ] 17 Contain /api/dispatch/start without introducing a public shared secret.
- [ ] 18 Secure checkout amount/currency/booking ownership and preserve webhook verification/idempotency.
- [x] 19 Minimize and capability-protect public tracking.
- [x] 20 Remove sensitive pre-offer driver fields while preserving acceptance.
- [x] 21 Remove driver/admin auth-token authority from localStorage and Bearer headers.
- [ ] 22 Preserve safe local limits and document the missing distributed rate limiter.
- [x] 23 Reuse Zod and validate all security-sensitive payloads.
- [ ] 24 Standardize 401/403/404/409/400/422 behavior without information leaks.
- [ ] 25 Ensure each actor logout clears only its own cookies and invalidates sessions where supported.
- [x] 26 Keep middleware for page UX only; enforce API authorization in handlers/helpers.
- [ ] 27 Verify Children Transport regression behavior with the feature flag disabled.
- [ ] 28 Verify Standard, Senior, ZTP/accessibility, Airport/Tourism, and future WAV compatibility.
- [ ] 29 Add meaningful auth, IDOR, booking, dispatch, payment, tracking, and regression tests.
- [x] 30 Run targeted/full lint, type checks, tests, Prisma validation only when applicable, and production build.
- [x] 31 Perform final repository security search and classify every remaining legacy occurrence.
- [ ] 32 Record changed files, schema changes, deferred items, prerequisites, git status, and diff stat.

## Scope lock

Phase 3B state migration, automatic dispatch, Redis/BullMQ, Socket.IO, scheduled claims, earnings redesign, maps/navigation, WAV activation, and destination changes are explicitly deferred.
Verification note: local rate limits remain active; distributed multi-instance rate limiting remains explicitly blocked on Redis provisioning and is recorded as a Phase 3B prerequisite.
