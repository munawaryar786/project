# PHASE 3I FINAL RELEASE CHECKLIST

Branch gate: `phase-3i-auth-booking-communications`
Approved parent: `9d8db4c`
Scope: passenger authentication, OTP/reset security, booking confirmation/invoice email, admin escalation, and quote reliability.
Guardrails: no commit, push, merge, deploy, Prisma DB push, migration, production write, or pricing seed.

Each item below was audited against the current worktree. PASS means implemented and verified locally. PENDING means a deployment prerequisite intentionally not run in this branch.

1. Baseline and scope — PASS. Branch and approved ancestry are correct; worktree changes are Phase 3I artifacts.
2. Complete file inventory — PASS. Inventory and purpose are recorded in the final gate report.
3. Exact Prisma schema diff — PASS. Only `EmailDelivery` was added; no OTP/password-reset field or index was changed.
4. EmailDelivery production safety — PASS. Stores kind, recipient, unique logicalKey, status, attempts, sanitized lastError, timestamps, and sentAt; no tokens, OTP, passwords, sessions, cards, or private payloads.
5. Email idempotency DB guarantee — PASS. `logicalKey @unique` plus atomic status/attempt CAS covers confirmation invoice, no-driver escalation, and delivery retries.
6. First-time OTP registration — PASS. Existing mobile → OTP → account details/password → canonical session flow is preserved.
7. Returning login — PASS. Phone or email plus password uses normalized lookup, bcrypt, generic errors, canonical session, and legacy compatibility.
8. OTP generation security — PASS. `crypto.randomInt`, six digits, five-minute expiry, max attempts, rate limit, no OTP URL/log output.
9. OTP replay/concurrency — PASS. `updateMany` claim requires unused, unexpired, and attempts below max; only one concurrent verifier can claim.
10. OTP resend — PASS. Previous active OTPs are invalidated and the five-minute/three-request rate window provides resend cooldown; no unlimited SMS path.
11. Phone normalization/uniqueness — PASS. Existing canonical normalizer is reused; duplicate preflight is documented and no unique index was added.
12. Email normalization/uniqueness — PASS. Trim/lowercase is deterministic; account creation rejects an existing owner; historical duplicate preflight is documented.
13. Account collisions — PASS. Existing phone/email/password/legacy/partial states fail safely without silent merging.
14. Password storage — PASS. Existing bcrypt hashing is reused; passwords are not logged, emailed, or accepted with arbitrary passenger identity.
15. Forgot-password enumeration — PASS. Unknown and known email requests return the same generic response.
16. Reset-token security — PASS. Opaque token, hashed proof storage, expiry, single-use CAS consumption, and reset-attempt binding are enforced.
17. Password reset/authVersion — PASS. New hash, session/trusted-device revocation, authVersion increment, and canonical new session are implemented.
18. Password-reset email — PASS. Drivo branding, public reset URL, expiry/one-use notice, security notice, and support contacts are present.
19. Invoice trigger paths — PASS. Stripe PENDING→CONFIRMED webhook and non-card authenticated continuation are the only confirmed completion paths; helper no-ops before CONFIRMED.
20. Invoice exactly-once logical delivery — PASS. `BOOKING_CONFIRMATION_INVOICE:<bookingRef>` is unique and CAS-claimed; retry does not create another logical record.
21. Email failure semantics — PASS. Delivery state changes independently; booking status, fare, payment, booking identity, and dispatch are not rolled back or altered.
22. Invoice template — PASS. Responsive email-safe table markup includes reference, service, pickup, destination, date/time, passenger count, luggage, assistance, distance, total/currency, payment method, status, and support.
23. Invoice legal claims — PASS with prerequisite. No fabricated legal metadata is emitted; legal company/VAT/address review remains a production/business prerequisite.
24. Invoice privacy — PASS. No card, Stripe secret, OTP, password, reset token, JWT, medical diagnosis, admin notes, or unnecessary child data.
25. Email logo reliability — PASS with staging prerequisite. Existing `drivo-logo-transparent.png` is used only from configured public site URL; text fallback is used when unset. Gmail rendering remains pending staging.
26. Driver accepted → admin notification — PASS. Worker handles authoritative `DRIVER_OFFER_ACCEPTED` outbox events after assignment and persists admin notification.
27. Admin notification idempotency — PASS. Notification `dedupeKey` is unique and event/recipient deterministic; realtime remains signal→REST refetch.
28. Driver accepted email policy — PASS. No new routine admin email is sent for normal acceptance.
29. Dispatch exhausted trigger — PASS. Worker reacts to authoritative `DISPATCH_EXHAUSTED` outbox event, not browser timers.
30. No-driver admin notification — PASS. Persistent notification, realtime signal, safe booking reference, and operational context are emitted once per event identity.
31. No-driver admin email — PASS. Configured `ADMIN_BOOKING_EMAIL`/approved equivalent is used; no personal address is hardcoded.
32. No-driver privacy — PASS. Email contains operational assignment fields only; no auth, payment, OTP, password, diagnosis, or child-private data.
33. No-driver recipient policy — PASS. Only Admin/Operations recipient receives escalation; passenger and drivers are excluded.
34. Exhaustion deduplication — PASS. `NO_DRIVER_ADMIN_ESCALATION:<bookingRef>` is unique and worker retries are CAS/idempotent. A future distinct dispatch-cycle identity is a documented extension if the product later permits repeated cycles.
35. Phase 3H manual assignment — PASS. Existing Admin Operations authorization, CSRF, Origin, eligibility, CAS/transaction, audit, and outbox paths are reused.
36. Authoritative distance source — PASS. Passenger fare paths use pickup→destination quote distance; driver navigation quantities remain operational.
37. Estimate/booking consistency — PASS. Estimate, booking creation, payment amount, and invoice total use the authoritative quote/persisted fare path.
38. Meters→km safety — PASS in existing route conversion and UX1 checks; staging route-provider verification remains pending.
39. Progressive pricing regression — PASS in existing UX1/pricing checks, including the approved 136 km behavior; no new formula added.
40. Fare does not use driver distance — PASS. Source and regression checks contain no driver-location fare input.
41. Assistance pricing — PASS. Existing EUR 10/hour pro-rata remains unchanged.
42. Waiting pricing — PASS. Existing assisted/standard/airport free minutes and rates remain unchanged.
43. Database pricing precedence — PASS. `PricingSettings` and active distance tiers remain authoritative over defaults.
44. Stripe authority — PASS. Browser values cannot control Stripe amount; invoice is display-only.
45. Route-provider failure — PASS. Existing safe failure behavior remains; no fabricated distance/fare/confirmed email path was added.
46. Email/outbox transaction boundary — PASS. Business/outbox state is authoritative; provider delivery is post-transaction and independently retryable.
47. BullMQ/retry limits — PASS. Existing outbox/BullMQ retry path remains bounded; EmailDelivery adds a three-attempt DB CAS bound.
48. Production SMTP safety — PASS with prerequisite. Configuration is read only; required environment validation remains deployment work.
49. SMS provider safety — PASS with prerequisite. Twilio fallback integration and env usage are retained; no credentials are in code/report; real Slovakia delivery remains staging work.
50. Accessibility — PASS. Reset form has labels, native keyboard controls, visible status role, and existing design-system focus/touch behavior.
51. Localization — PASS. New UI strings use the existing `t(key, fallback)` system; no second translation framework.
52. Security/secret scan — PASS. No credentials, raw OTP, reset token, password, JWT/session secret, Stripe secret, Mongo URI, or Redis password added.
53. Email template injection — PASS. Dynamic HTML fields use `escapeHtml`; user-entered names/addresses/notes cannot inject markup.
54. Header injection — PASS. Subject/recipient values are controlled templates/config; user input is not used as a mail header.
55. Phase 3I test quality — PASS. 83/83 static/source checks; no real SMS, SMTP, Mongo concurrency, browser E2E, or production integration was run.
56. Homepage regression — PASS. `npm run test:homepage-priority` 17/17.
57. Phase 3H regression — PASS. 146/146.
58. Phase 3G regression — PASS. 109/109.
59. Phase 3F regression — PASS. 96/96.
60. Phase 3E regression — PASS. 61 static/source checks.
61. Phase 3D regression — PASS. 62 static/source checks.
62. Phase 3C regression — PASS. 59 checks.
63. Phase 3B regression — PASS. 67 static plus 45 isolated behavioral checks.
64. Phase 3A security — PASS. Static and isolated runtime/security checks pass.
65. UX1 regression — PASS. Pricing, WAV, distance-source, and Children flag checks pass.
66. Static/build gate — PASS. Diff check, all regression scripts, Prisma validate/generate, TypeScript, lint, and build pass; middleware deprecation warning is non-blocking.
67. Read-only plan review — PASS. Duplicate identities, verification/authVersion, legacy accounts, incomplete registrations, reset proofs, EmailDelivery, confirmed invoices, dispatch history, pricing, distance/fare anomalies, index collisions, and schema compatibility are covered.
68. Schema synchronization impact — PASS with prerequisite. New `email_deliveries` collection, unique logicalKey index, kind/status/createdAt and status/createdAt indexes; no backfill, no existing-document rewrite; duplicate preflight required.
69. Real SMS staging plan — PREPARED. New mobile, invalid/valid/replay/expiry/resend/password/logout/password-login and Slovakia delivery cases are listed in the final report.
70. Real password-reset staging plan — PREPARED. Registered email, actual link, password change, replay rejection, old-session behavior, and new login cases are listed.
71. Real invoice-email staging plan — PREPARED. One confirmed invoice, logo rendering, Gmail desktop/mobile, data/privacy, webhook retry, and no-duplicate cases are listed.
72. Real admin acceptance plan — PREPARED. Assignment, one notification, realtime signal, refetch, correct driver, and race/failure cases are listed.
73. Real no-driver escalation plan — PREPARED. Exhaustion, one notification/email, no passenger/driver mail, Admin Operations, manual assignment, audit, and outbox cases are listed.
74. Real distance/pricing E2E plan — PREPARED. Representative routes including approximately 136 km trace provider meters through estimate, booking, Stripe, confirmation, and invoice.
75. Consolidated prerequisites — PASS. All pending provider, migration, audit, legal metadata, staging, E2E, monitoring, backup, and rollback prerequisites are recorded.
76. Final report — PASS. `PHASE_3I_FINAL_RELEASE_GATE_REPORT.md` contains the exact A—AT sections, one final gate result, and owner-review ending.

No production query, schema synchronization, real SMS, real SMTP, browser E2E, or deployment action was performed.