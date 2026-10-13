# Phase 3 identity hardening: architecture and decisions

**Design only — no application or database change is authorized.** Read with [the approved identity policy](PHASE3_IDENTITY_POLICY.md) and [the existing real-data audit specification](LEGACY_COLLISION_AUDIT_SPEC.md). Source findings below describe the local worktree on 2026-10-12; deployed data and indexes are unverified.

## Mandatory 32-item checklist

Statuses describe **this design/preparation task**, not implementation. `BLOCKED` needs a separate owner/data/schema decision; `DEFERRED` needs tests, real-data or provider evidence.

| ID | Area | Status |
| --- | --- | --- |
| H01 | Passenger schema and declared indexes | DESIGN COMPLETE; deployed indexes DEFERRED |
| H02 | Raw phone identity | DESIGN COMPLETE |
| H03 | Existing phone normalization | DESIGN COMPLETE |
| H04 | Canonical E.164 representation | DESIGN COMPLETE; implementation BLOCKED |
| H05 | Country-specific validity | BLOCKED on parser/country-policy approval |
| H06 | International handling | DESIGN COMPLETE; fixture verification DEFERRED |
| H07 | OTP phone-control evidence | DESIGN COMPLETE; provider verification DEFERRED |
| H08 | Registration and phone change | DESIGN COMPLETE; implementation BLOCKED |
| H09 | Concurrent duplicate registration | DESIGN COMPLETE; database race test DEFERRED |
| H10 | Existing account email | DESIGN COMPLETE |
| H11 | Email normalization | DESIGN COMPLETE; final key semantics BLOCKED |
| H12 | Email inbox ownership proof | DESIGN COMPLETE; implementation BLOCKED |
| H13 | Proof expiry and single use | DESIGN COMPLETE; tests DEFERRED |
| H14 | Email change/reverification | DESIGN COMPLETE; implementation BLOCKED |
| H15 | Verified-email uniqueness | DESIGN COMPLETE; index approval BLOCKED |
| H16 | Shared booking contact emails | DESIGN COMPLETE |
| H17 | Ambiguous phone login | DESIGN COMPLETE; route change BLOCKED |
| H18 | Ambiguous email reset | DESIGN COMPLETE; transition approval BLOCKED |
| H19 | Password-reset authority | DESIGN COMPLETE; tests DEFERRED |
| H20 | Historical compatibility | DESIGN COMPLETE; real collisions DEFERRED |
| H21 | Sessions and booking ownership | DESIGN COMPLETE; regressions DEFERRED |
| H22 | Offline collision tool | PREPARATION COMPLETE; unexecuted |
| H23 | Aggregate privacy | DESIGN COMPLETE; review/tests DEFERRED |
| H24 | Conflict classification | DESIGN COMPLETE |
| H25 | Human remediation | DESIGN COMPLETE; individual action BLOCKED |
| H26 | Prisma/MongoDB feasibility | DESIGN COMPLETE; staging proof DEFERRED |
| H27 | Unique/partial index design | DESIGN COMPLETE; creation BLOCKED |
| H28 | Rollout sequence | DESIGN COMPLETE; execution BLOCKED |
| H29 | Rollback/recovery | DESIGN COMPLETE; rehearsal DEFERRED |
| H30 | Deferred testing | DESIGN COMPLETE |
| H31 | Accessibility and four languages | DESIGN COMPLETE; linguistic/browser checks DEFERRED |
| H32 | Git, backup, security, VPS preservation | PREPARATION COMPLETE: final status checked; byte-for-byte comparison of every pre-existing file was not established |

## Confirmed source facts and design consequences

* **CONFIRMED FROM SOURCE:** `prisma/schema.prisma:154-180` has unique raw `Passenger.phone`, non-unique `normalizedPhone` and `email`, `phoneVerified`, and no email-verification state. `Booking.customerEmail` is separate (`:90-95`). **DESIGN PROPOSAL:** new verified identity keys; existing contact fields remain non-unique. **REQUIRES DATA AUDIT:** deployed collisions and actual index definitions.
* **CONFIRMED FROM SOURCE:** `lib/passenger-auth.ts:30-51` strips arbitrary non-digits, defaults national input to `+421`, tests E.164 structure, and lowercases the entire email. **DESIGN PROPOSAL:** reject ambiguous phone syntax and create versioned canonical keys only after reviewed parsing. **REQUIRES OWNER APPROVAL:** country parser and email-key normalization.
* **CONFIRMED FROM SOURCE:** account creation (`app/api/passenger/account/create/route.ts:73-230`) has booking/phone proof and transactional booking binding, but email and phone prechecks are not unique database claims. Password login (`login/password/route.ts:19-52`), resolve-phone (`auth/resolve-phone/route.ts:33-37`), OTP compatibility (`login/otp/verify/route.ts:39`), and reset email (`password-reset/email/route.ts:30`) use first-match identity lookup. **DESIGN PROPOSAL:** explicit zero/one/many resolution before authentication or proof issuance. **REQUIRES RUNTIME VERIFICATION:** concurrent behavior.
* **CONFIRMED FROM SOURCE:** profile completion (`profile/complete/route.ts:34-68`) updates account email without verifying the new inbox; reset sends to a matched stored email. Atomic reset completion (`password-reset/complete/route.ts:29-51`) protects proof consumption and password/session changes, but cannot make the earlier email lookup unambiguous. **DESIGN PROPOSAL:** verified-email enrollment and an owner-approved legacy recovery transition.
* **CONFIRMED FROM SOURCE:** `lib/security/passenger-session.ts` checks the database session and account authVersion. `lib/booking-access.ts` and `booking/continue/route.ts` enforce owner or guest capability before binding. **Design invariant:** identity remediation never changes booking ownership by matching contact details. **REQUIRES RUNTIME VERIFICATION:** regression tests.

## Future ambiguous-identity decision table

All public responses stay generic, localized and rate-limited. `findFirst` is never an authority decision for a non-unique identity. Existing authenticated sessions remain account-ID based unless a separately justified security event revokes them.

| Condition | Login | Reset/enrollment | Bookings and human review |
| --- | --- | --- | --- |
| No matching account | Generic credential failure | Generic reset acknowledgement; no proof | Guest capability unchanged. |
| One verified canonical phone | Password/OTP rules still apply | Phone change or email enrollment requires account authority and fresh proof | No automatic booking claim. |
| Many accounts at one canonical phone | Do not select one; generic failure for that identifier | No phone-based reassignment; route to controlled recovery | Preserve existing sessions and distinct bookings; independent claimant checks. |
| Many accounts at one account-email key | Email identifier unusable until resolved | Issue no account-selecting reset proof; generic response | Phone/password or existing session may remain usable if unambiguous; support review. |
| One account, email unverified | Transitional password login only if identifier is unique, pending owner policy | No automated recovery to this unverified inbox after cutover; offer verified enrollment or reviewed support | Existing account/session access retained. |
| Invalid/ambiguous legacy phone | Do not guess country or rewrite on login | Fresh verified number enrollment or reviewed recovery | Preserve historical account and booking IDs. |
| Conflicting proof evidence | Fail closed and invalidate pending promotion attempt | Generic response, retain audit marker | Security reviewer resolves; never auto-merge. |
| Historical bookings, active sessions | Account-ID session may remain valid | Identity change follows explicit account authority and proof | No booking migration; revoke sessions only for the approved security event. |
| Outstanding reset proof during identity change | Existing proof cannot promote a new identity | Revoke matching outstanding proofs transactionally; stale completion fails | No raw token disclosure. |

## Human-reviewed exception process

Aggregate audit identifies categories, never people. A separately approved, role-limited case workflow may inspect one case at a time with dual-control review, independent account-control evidence, minimal retention, customer outreach/consent where appropriate, and audit log without raw proof tokens. Record the reason, evidence class, reviewer, decision, and affected-account count in an access-controlled case system. Do not create a hidden account link, merge, delete, revoke, lock, or reassign a booking from a collision report. Offer non-identifier support access for legitimate users who cannot use an ambiguous login; actual recovery mechanism and support authentication need owner approval.

## Application change boundary and Phase 4

Future changes are limited to identity models/indexes, the existing passenger registration/login/reset/profile/OTP routes and UI, and shared identity helpers under a new approval. Preserve early login, email-reset language, WhatsApp verification, atomic reset, JWT+database sessions, logout, guest capabilities, continuation, transactional email locale snapshots, all four UI languages, and staff/driver operations. Payment, dispatch, schedules, capacity, luggage, eligibility, and WAV presentation/behavior remain untouched.

Phase 4 draft recovery must wait. A returning passenger's login or reset may restore only that account's state; an unfinished guest booking still needs its original capability or an independently authorized owner binding. A shared family booking contact gives no draft or booking access.
