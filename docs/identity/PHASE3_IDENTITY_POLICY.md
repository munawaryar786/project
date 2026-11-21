# Phase 3 passenger identity policy and rollout proposal

**Status:** planning only, 2026-10-12. No customer data was inspected. No schema, account, index, or authentication change is authorized by this document. Phase 3 identity enforcement remains blocked pending the approvals and gates below.

## Mandatory preparation checklist

`REVIEWED` means current source was inspected; it does not mean the future policy is implemented. `PROPOSED` means a design exists but needs approval/implementation. `UNVERIFIED` requires authorized runtime, data, or provider evidence.

| ID | Area | Preparation status |
| --- | --- | --- |
| ID-01 | Passenger account schema | REVIEWED |
| ID-02 | Raw phone storage | REVIEWED |
| ID-03 | Phone normalization | REVIEWED |
| ID-04 | Country-code handling | REVIEWED; country-specific validity UNVERIFIED |
| ID-05 | E.164 canonicalization | REVIEWED current syntax; strengthened policy PROPOSED |
| ID-06 | Existing raw-phone uniqueness | REVIEWED; deployed index UNVERIFIED |
| ID-07 | Normalized-phone uniqueness | REVIEWED absent in schema; rollout PROPOSED |
| ID-08 | Login/recovery email storage | REVIEWED |
| ID-09 | Email normalization | REVIEWED; future key policy PROPOSED |
| ID-10 | Email verification authority | REVIEWED absent in current model; future proof PROPOSED |
| ID-11 | Email uniqueness | REVIEWED absent in schema; rollout PROPOSED |
| ID-12 | Booking contact versus account identity | REVIEWED |
| ID-13 | Registration creation paths | REVIEWED |
| ID-14 | OTP account-linking paths | REVIEWED; provider behavior UNVERIFIED |
| ID-15 | Password-login resolution | REVIEWED |
| ID-16 | Email reset account resolution | REVIEWED |
| ID-17 | Profile completion/update | REVIEWED |
| ID-18 | Guest booking/continuation | REVIEWED |
| ID-19 | Legacy account creation/setup | REVIEWED current compatibility paths; historical deployed writers UNVERIFIED |
| ID-20 | Concurrent registration | REVIEWED source race; database behavior UNVERIFIED |
| ID-21 | Legacy identity collisions | Classification PROPOSED; actual counts UNVERIFIED |
| ID-22 | Privacy-safe audit | Non-executable specification PREPARED; execution UNVERIFIED |
| ID-23 | Conflict remediation | PROPOSED; individual cases UNVERIFIED |
| ID-24 | Database-index feasibility | PROPOSED; deployed indexes/staging behavior UNVERIFIED |
| ID-25 | Rollout/rollback | PROPOSED; rehearsal UNVERIFIED |
| ID-26 | Takeover and ownership controls | REVIEWED source; runtime regression UNVERIFIED |
| ID-27 | Deferred verification | GATES DOCUMENTED |
| ID-28 | Worktree/backup preservation | REVIEWED: 151 starting status entries retained; only this documentation directory added, zero staged; three backups and snapshot present |

## Approved owner policy and boundaries

* At steady state, one Passenger account owns each canonical E.164 phone. A verified account login/recovery email belongs to no more than one Passenger account.
* `Booking.customerEmail`, `Booking.customerPhone`, parent/guardian contacts, and dispatcher-entered contacts are delivery/contact details, not account identity. They may recur across bookings and family/caregiver arrangements.
* A shared contact, verified phone, or email match alone does not transfer an existing Booking. Retain account session authority and the booking owner/capability checks. Do not automatically merge, delete, reassign, or lock out colliding historical accounts.
* Historical `cs` booking language, WAV presentation/eligibility, payment, dispatch, outbox, and all other non-identity behavior are outside this change.

## Current source evidence and identity-path inventory

| Path | Inputs and proof | Lookup/write and current assumption | Risk / future work |
| --- | --- | --- | --- |
| `prisma/schema.prisma:154` | Passenger identity | `phone @unique`; `normalizedPhone?` and `email?` only indexed; `phoneVerified`, no account-email verification state | Raw unique phone does not enforce canonical uniqueness or verified email uniqueness. |
| `lib/passenger-auth.ts:30` | Phone, default `+421` | Removes punctuation, recognizes `+`/`00`, otherwise prefixes context after stripping leading zeroes; regex checks 8–15 digits following `+` | Syntax-only E.164 check; weak country/context validation; non-digit characters can be silently stripped. |
| `lib/passenger-auth.ts:49` | Email | `trim().toLowerCase()` | No inbox proof or database canonical key; Unicode/case and legacy handling need explicit policy. |
| `app/api/passenger/auth/resolve-phone/route.ts:18` | Phone, optional booking ID | Rate-limited; booking capability/owner if booking ID supplied; exact-or-last-seven candidate search, `take:25`; returns REGISTER/LOGIN/LEGACY_SETUP | Collision can select arbitrary candidate; without booking ID, mode reveals account existence. Preserve compatibility while addressing enumeration separately. |
| `app/api/otp/send/route.ts:21`, `app/api/otp/verify/route.ts:18` | Booking capability/owner, normalized booking phone, Twilio Verify OTP | Registration or legacy-setup proof tied to booking and phone; `findFirst` account lookup | Proof establishes control of a phone at that event, not sole ownership of every historical account with that number. Ambiguous legacy lookup must not select an account. |
| `app/api/passenger/account/create/route.ts:22` | Booking ID/capability, phone proof, name, email, password | Prechecks exact phone/normalizedPhone and case-insensitive email; transaction consumes proof and creates account or upgrades passwordless legacy account; binds booking | Email not inbox-verified. Prechecks do not serialize concurrent canonical/email writes. Legacy upgrade must not use ambiguous phone match. |
| `app/api/passenger/login/password/route.ts:10` | Email or phone plus password | Email `findFirst` case-insensitive; phone direct `findFirst`, then last-seven candidates `take:25`; successful phone login rewrites raw and normalized phone | Ambiguous identifiers yield nondeterministic selection; login-time rewrite can collide or reinterpret legacy numbers. Login itself does not claim booking. |
| `app/api/passenger/login/otp/send/route.ts:3`, `.../verify/route.ts:15` | Step-up OTP | Send route currently returns 400; verify route remains present, uses phone `findFirst` and account-bound PassengerOtp | Treat as compatibility surface, not evidence that fresh step-up issuance is active. Audit callers before changing. |
| `app/api/passenger/password-reset/email/route.ts:10` | Submitted account email | Generic response, rate limit, case-insensitive `findFirst`, proof tied to selected Passenger, email sent to submitted address | There is no account-email verification state; duplicate email selects one account and may create a cross-account recovery hazard. Generic response prevents straightforward enumeration but not ambiguity. |
| `app/api/passenger/password-reset/complete/route.ts:9` | Hashed single-use proof and attempt ID | Transaction checks/consumes proof, revokes sessions/devices, updates password/authVersion, creates session | Atomic completion protects the selected account; it does not establish that the original email-to-account lookup was unique. Legacy phone-proof compatibility remains. |
| `app/api/passenger/password-reset/send/route.ts`, `.../verify/route.ts` | Legacy paths | Generic compatibility send response; verify returns 410 | Do not reactivate deprecated phone reset. |
| `app/api/passenger/profile/complete/route.ts:11` | Authenticated name, email, password | Email lowercased; exact case-sensitive `findFirst` precheck; updates email/password and revokes sessions outside one transaction | No inbox reverification or unique index; case/collision race and partial-failure risk. Separate future identity implementation. |
| `lib/security/passenger-session.ts:6`, `lib/passenger-auth.ts:69` | JWT plus DB session | Active session row, token hash, expiration, Passenger status/authVersion; legacy session upgrade | Keep DB-backed revocation; do not infer account ownership from trusted-device cookie. |
| `app/api/passenger/me/route.ts`, `.../logout/route.ts`, `.../bookings/route.ts` | Live session | Reads account by session; logout revokes Passenger sessions; bookings query by `passengerId` | Keep account-ID authority even when legacy contact identifiers collide. |
| `lib/booking-creation-service.ts:37`, `app/api/bookings/route.ts` | Public/dispatcher booking contact fields | Booking created separately; authenticated and phone-verified matching actor may be bound; guest capability otherwise | Booking contact is not an account unique key. Preserve current ownership gates; review any future automatic association carefully. |
| `lib/booking-access.ts:34`, `app/api/passenger/booking/continue/route.ts:9` | Authenticated actor plus booking owner/capability | Owner or hashed capability required; continuation checks verified matching phone before binding | Contact match never bypasses capability/owner. Preserve transaction CAS and guest support. |
| `app/api/dispatch/bookings/*`, `app/api/admin/*` | Staff booking and operational contacts | Search found booking-contact writes/reads, no active Passenger create/update in staff API paths | Dispatcher contacts stay separate; rerun whole-repo writer search before implementing indexes. |
| `app/passenger/login/page.tsx`, `app/passenger/reset/page.tsx`, `app/passenger/profile/page.tsx`, `components/booking/BookingForm.tsx` | UI identifiers and contact fields | Existing login, reset and early booking login invoke routes above | No Phase 4 draft recovery; preserve multilingual/auth state and booking values. |

The current search found active Passenger writes in account creation, password login, legacy OTP verify, reset completion, and profile completion. Test fixtures and earlier migration artifacts also create passengers but are not live account-creation routes. Historical production account-creation code and actual index inventory cannot be established from the current source alone.

Future implementation file groups, each requiring separate authorization: `lib/passenger-auth.ts` for reviewed canonicalizers; `prisma/schema.prisma` and an approved native-index manifest if needed for keys/proofs; `app/api/passenger/account/create/route.ts`, `auth/resolve-phone/route.ts`, `login/password/route.ts`, `login/otp/verify/route.ts`, `password-reset/email/route.ts`, and `profile/complete/route.ts` for unambiguous identity resolution and verified changes; `app/api/otp/*` for collision-safe phone proof binding; `lib/security/passenger-session.ts` and `lib/booking-access.ts` for regression review without weakening authority; the public/booking profile UIs for enrollment and safe errors; isolated identity fixtures and concurrency tests. No edits to these implementation files are made by this plan.

## Canonical phone contract proposed for separate implementation approval

1. Accept `+` plus country code and national significant number, or `00` international prefix, or a national input only when a country context is explicitly selected. Retain `+421` default for existing Slovak UI behavior, but do not infer Slovakia for already-international legacy values. Reject alphabetic/extra-plus/ambiguous punctuation rather than silently deleting arbitrary characters. Validate the normalized result as E.164 length and, after approval, supported country-specific rules. No new library is authorized now; decide whether a reviewed phone-number library is necessary before implementation.
2. Preserve the original `Passenger.phone` for historical display/compatibility until a controlled migration. Introduce a separately named canonical key or carefully migrate `normalizedPhone`; do not overwrite a valid but ambiguous stored value automatically. Track invalid/missing/ambiguous legacy records as exceptions. Verification proves control of the specific canonical phone at verification time; it does not prove that two legacy accounts are the same person.
3. New registration and phone changes require fresh verification of the proposed canonical number, explicit authenticated account authority for changes, and a unique database claim. During transition, reject new ambiguous claims safely while preserving existing account-ID sessions and booking ownership. Do not silently bind a collision to whichever `findFirst` returns.
4. `Booking.customerPhoneCode` and `Booking.customerPhone` must remain booking contacts. The public UI currently offers `+421,+420,+43,+49,+44,+92`; dispatcher offers `+421,+420,+49,+44,+380`. This is evidence of supported entry contexts, not of country-specific validation. National leading-zero behavior, extension syntax, and historical formats need fixture review before a canonicalizer is approved.

## Account email contract proposed for separate implementation approval

* Separate current contact `Passenger.email` from a **verified account login/recovery identity**. Proposed minimal fields: normalized verified login email key and verification timestamp, plus a pending proposed email and expiring single-use challenge/proof as needed. Exact model names and proof retention require owner/schema review. No existing populated email is to be marked verified by inference.
* Conservative normalization: trim surrounding ASCII whitespace, validate mailbox syntax and length, lowercase the domain; choose and document case-folding for the local part only after legacy collision analysis (current application lowercases it). Do **not** strip dots, plus tags, or provider-specific aliases. Store a stable key matching the chosen collation; do not rely on query collation alone for uniqueness.
* Changing the account email needs authenticated account authority and proof of the **new inbox** before promotion to recovery/login identity. A booking contact email may be edited or shared independently and never gains reset authority merely by being on a booking. Family members may share booking emails; they cannot share the same verified account login email under the approved policy.
* Current email is not verified: there is no `emailVerified` field or email proof in `Passenger`; `account/create` and profile update accept email after phone/session proof, while reset sends to the stored email. A password-reset link sent to an email does not retroactively prove prior ownership unless a successful, account-bound verification event is explicitly recorded. Transitional recovery for unverified or collided emails requires a separate owner decision to avoid lockout and takeover.

## Collision classification and resolution proposal

| Case | Security/legitimate explanation | Required verification, sessions/bookings, and proposed resolution |
| --- | --- | --- |
| A. Same canonical phone, multiple accounts | Shared/reassigned number, formatting duplication, or malicious registration | Freeze new claims to this key; preserve existing ID-based access; verify each claimant independently and investigate history. Never auto-merge or move bookings. Customer outreach and trained admin review may be needed. |
| B. Same normalized account email, multiple accounts | Family inbox, typo, or takeover path | Do not make the email a unique recovery key until each account has a distinct verified address or approved exceptional recovery. Existing sessions remain ID-bound; ambiguous reset should not select `findFirst` after future safety change. |
| C. Family email across booking contacts | Legitimate shared mailbox | Leave Booking contacts untouched; do not count contact-only repeats as account collisions or use them to prove ownership. |
| D. Invalid or missing phone | Old import, country-context ambiguity | Preserve account and bookings; manual re-verification to a valid phone before canonical claim. No guessed +421 conversion. |
| E. Unverified account email | Historical email entry without inbox proof | Keep as contact/legacy field, not verified recovery identity. Offer a verified-email enrollment or approved recovery channel. |
| F. Historical bookings, outdated contacts | Normal account lifecycle | Owner/capability evidence governs each booking; contact correction alone does not reassign historical rides. |
| G. Two accounts, separate bookings, conflicting identifiers | Family/caregiver or duplicate registration | Maintain both accounts and bookings until independent owner evidence and explicit, separately approved remediation. No automatic reassignment even if one contact matches. |
| H. Ambiguous recovery | `findFirst` could choose wrong account | Generic public response; route to controlled support or account-bound verified mechanism, with audit trail and no identifier disclosure. Existing active sessions are not indiscriminately revoked by a collision report. |
| I. Concurrent registration during rollout | Check-then-write race | Database unique claim plus duplicate-key handling. Deploy compatible app first, block/route conflicting claims during transition, then build index only after cleanup/recheck. |

For every manual case, require the minimum necessary proof, role-limited case access, audit trail, customer consent/outreach where personal data or account control changes, and a second approval before any booking transfer, merge, lock, or deletion. This document authorizes none of those actions.

## Proposed indexes, rollout, and rollback

* Current `phone @unique` enforces exact stored raw value only. `normalizedPhone` and `email` are non-unique. Before changing anything, inspect actual MongoDB index definitions and legacy aggregate collisions under a separately authorized read-only audit; schema text is not proof that deployed indexes match.
* Preferred eventual phone key: non-null `canonicalPhone` on resolved accounts, unique on valid canonical strings. A partial unique MongoDB index filtered to string-valued canonical keys can exclude missing/null legacy records, but **cannot** fulfill the one-account-per-phone policy while unresolved duplicate accounts lack keys. Those are explicitly tracked transition exceptions, never silently treated as compliant. An identity-claim collection with a unique key is an alternative if grandfathering conflicts requires prolonged coexistence; it adds model/transaction complexity and needs separate approval.
* Preferred email key: `verifiedLoginEmailKey` populated only after inbox proof, with a partial unique index restricted to valid string keys (and optionally a verification marker under the final model). Missing/null/unverified emails must not consume the unique slot. Booking contact email is never indexed uniquely. The key's normalization and index collation must agree. A simple unique nullable Prisma field is not assumed safe for MongoDB missing/null semantics.
* Installed project is Prisma 6.19.2 with MongoDB. Verify the exact index-management approach against that version in disposable staging; do not assume the current Prisma schema can express the required partial predicate. If a native MongoDB partial index is needed, maintain an approved index manifest/verification procedure outside `db push`, and prevent Prisma drift or accidental drop. No index command is provided here for production execution.
* Application rollout must replace ambiguous `findFirst` resolution with explicit 0/1/>1 handling, require fresh proof for changed identifiers, keep legacy session/booking access by account ID, and map duplicate-key errors to generic safe outcomes. Registration/profile writes and any identity promotion need transactionally consistent claims; prechecks are UX only.

Sequence: (1) separately approve read-only aggregate audit with restricted credentials; (2) owner reviews suppressed counts and exceptions; (3) approve privacy-safe case handling and individual authorized investigation; (4) verified backup/restore and rollback rehearsal; (5) implement schema, compatibility reads, explicit collision handling, and email verification behind a safe transition; (6) isolated MongoDB concurrency and legacy fixtures; (7) deploy compatible application before enforcement, with new claims safely gated; (8) re-audit immediately before building indexes, create/verify indexes under separate change approval; (9) enable new-identity writes, monitor duplicate-key and recovery outcomes; (10) retain exception workflow until no unresolved collision remains. Index creation is not a substitute for conflict resolution.

Rollback: stop new identity promotions/claims without invalidating existing sessions; restore previous compatible application path only if it understands any newly populated fields and indexes; retain new fields/data for forensic recovery; if an index must be removed, require a separate, audited DB change and preserve a guard against duplicate writes. Restore from tested backup only for an actual data-corruption incident, never as a routine index rollback. Do not delete migrated identity evidence or automatically merge accounts. Reconcile any writes made between backup and rollback.

## Phase 4 and deferred verification

Phase 4 may restore an unfinished draft after login/reset, but it must resolve a single authenticated account, then prove booking ownership or possession of the existing guest capability. Cross-device login does not transfer a guest booking without approved proof. Family/caregiver contact overlap is expected; it grants no booking authority. Reset return should resume the correct local journey without embedding tokens in draft storage. No Phase 4 code is authorized here.

Deferred gates: synthetic normalization matrix across country contexts; invalid punctuation/Unicode cases; email normalization and proof lifecycle; concurrent registration/profile/email promotion in a disposable MongoDB replica set; duplicate-key mapping; collision fixtures for login/reset/OTP/legacy account setup; ID-based session and guest capability regressions; Phase 1/2 payment/dispatch tests; privacy review of aggregate output; staging index rehearsal/rollback; human review of recovery support procedure. None were executed during this preparation.

## Additional approvals required

1. Separate authorization for **read-only production data access** and execution of a reviewed audit with a restricted credential; source review cannot establish real collision counts.
2. Approval of the phone canonicalizer/country policy, including whether a vetted numbering library may be added and how ambiguous legacy numbers are handled.
3. Approval of the minimal email verification/pending-email schema and transitional recovery policy for existing unverified or shared account emails.
4. Approval of the precise schema/index definitions, any native MongoDB index operation, data backfill, conflict-case handling, and controlled rollout/rollback.
5. Separate approval before customer outreach, individual record review, account merge/deletion/lockout/reassignment, or Phase 4 work.

Official database references for later design validation: MongoDB partial indexes: https://www.mongodb.com/docs/manual/core/index-partial/ ; Prisma 6 index documentation: https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/indexes . Version-specific staging validation remains mandatory.
