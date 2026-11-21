# Proposed MongoDB identity indexes, deployment and rollback

**No schema/index command in this document is authorized for execution.** The deployed index inventory and customer collisions have not been inspected. Read with [the identity policy](PHASE3_IDENTITY_POLICY.md), [email design](EMAIL_VERIFICATION_AND_RECOVERY_DESIGN.md), and [phone policy](CANONICAL_PHONE_POLICY.md).

## Current and proposed data contract

`prisma/schema.prisma:154-180` declares `Passenger.phone String @unique`, `normalizedPhone String? @@index`, and `email String? @@index`. `Booking.customerEmail String?` (`:90`) is independent and must remain non-unique. Existing `phoneVerified` is not enough to construct a new verified canonical claim. The installed manifest requests Prisma 6.19.2 and MongoDB; version-specific staging verification is required before selecting a schema/index method.

Proposed additive Passenger fields, **not yet approved for editing**:

| Field | Meaning | Missing/null legacy behavior |
| --- | --- | --- |
| `verifiedCanonicalPhone String?` | E.164 claim created only after current account-bound OTP and unique transaction | Missing until verified and conflict-free; legacy account remains usable by ID. |
| `verifiedCanonicalPhoneAt DateTime?` | Claim event time, not proof of perpetual number possession | Missing for legacy. |
| `verifiedLoginEmailKey String?` | Normalized inbox-verified login/recovery key | Missing until explicit inbox proof. |
| `verifiedLoginEmailAt DateTime?` | Successful proof time | Missing for all unverified legacy email. |
| `emailIdentityVersion Int` | Fences competing and stale verification proofs | Default 0 on introduction. |
| New email-proof model | Hashed single-use, expiring account-bound challenge | No legacy proof is invented. |

Exact field names, mapping and collection names require schema approval. Do not add `@unique` to nullable fields without proving its MongoDB behavior. The proposed native indexes are separately named `passenger_verified_canonical_phone_uq_v1` on `verifiedCanonicalPhone` and `passenger_verified_login_email_uq_v1` on `verifiedLoginEmailKey`, each unique with a partial filter requiring its key to be a string. This excludes missing/null legacy rows, but means the index protects **only populated claims**. It is not evidence that unresolved legacy accounts satisfy the policy. Leave existing `phone @unique` in place during transition; do not repurpose it as a canonical claim.

The application must reject empty strings before writing either claim because a string-type partial filter would index `""`. The proof collection also needs a unique token-hash index and bounded lookup indexes for `passengerId + purpose + identityVersion` and expiration/cleanup; an expiry/TTL mechanism is housekeeping, never the authority for accepting an expired proof. If a native partial unique index is kept outside the Prisma schema, Prisma Client may not offer `findUnique` for that field. Use a bounded ambiguity-aware lookup in application code and let the native index enforce writes; validate this exact client/schema relationship in staging.

Use a simple/binary-collation stored key, with the normalizer producing the exact same bytes for every write and lookup; do not rely on case-insensitive query collation to supply uniqueness. Native partial filters, index names, collation, and MongoDB server/version compatibility must be rehearsed in disposable staging. Prisma 6 schema cannot be assumed to manage these exact partial-index options; maintain an approved declarative native-index manifest and drift verification if that is the chosen path. Do not run `prisma db push` over unmanaged indexes without a reviewed compatibility procedure.

MongoDB's [unique-index rules](https://www.mongodb.com/docs/manual/core/index-unique/) treat repeated missing/null values differently from the desired optional-key model, and [partial unique indexes](https://www.mongodb.com/docs/manual/core/index-partial/) constrain only documents matching their filter. Prisma's [v6 index reference](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/indexes) documents supported schema attributes; the exact behavior with Drivo's installed Prisma 6.19.2 must be verified in staging.

## Deployment order with a closed race window

1. Obtain separate owner authorization for a read-only aggregate audit and actual index inventory. Review suppressed collision counts and whether stored nullable values or malformed types exist. Approve a case-by-case human investigation procedure if needed. No account is auto-merged or disabled.
2. Approve schema, normalization version, verification proofs, transitional recovery policy, application changes, and native index manifest. Prepare tested database backup, restore rehearsal, monitoring and rollback owner. Do not deploy an index before compatible code exists.
3. In isolated staging, test old and new app versions against additive fields, missing/null documents, native index build, duplicate-key error mapping, provider-failure compensation and transactional proof consumption. Confirm no automatic index drift from Prisma tooling.
4. Roll out compatible readers and explicit 0/1/>1 identity resolution to all app/worker instances. Keep new verified-key claims disabled behind a centrally coordinated **identity-write gate** while preserving existing login, sessions, bookings and guest capabilities. Ensure no old instance can write new identity claims. A local-only toggle is insufficient across instances.
5. Prepare legacy data only with separately approved case work. A verified key may be populated only from approved proof; unresolved collisions retain null key and an explicit exception state. Re-audit immediately before enforcement. If any intended indexed key collides, stop; do not let index build choose a winner.
6. Temporarily hold **new registration, phone changes, email promotions and any path that writes new claim fields** across every instance during native index build and verification. Existing account-ID authentication and booking operations continue if safely possible. If a hold cannot be made reliable, use a separately approved unique identity-reservation collection/transaction protocol before reopening writes. Application prechecks alone cannot close the race.
7. Build indexes under a separately approved database change, verify name/key/unique/filter/collation and query plans, then enable claims. A duplicate-key error from concurrent requests becomes a generic conflict and preserves the prior account/proof state; it never triggers a first-match reassignment. Monitor claims, duplicate keys, ambiguous logins, reset failures and manual-review backlog.
8. Resolve remaining grandfathered exceptions with verified human decisions. The approved invariant is not declared fully enforced until no unresolved verified-phone/email collision remains and all eligible accounts have their claims represented.

If an index build fails, keep the identity-write gate closed, inspect only aggregate failure diagnostics under approved access, retain previous application/session behavior, remediate data with separate authorization, then retry a reviewed build. Do not drop unrelated indexes, force an account merge, or permit unrestricted new claims while the unique index is absent.

## Rollback and recovery

Feature rollback first disables new identity promotions/claims through the shared gate. Keep additive fields and native indexes while compatible code is restored; old code must be proven not to overwrite or misinterpret them. A rollback to an app version that writes raw `phone`/`email` without claim awareness can reopen ambiguity, so it may be prohibited until a compatibility adapter is deployed. Index removal is a separate owner-approved database change and loses enforcement immediately; maintain a write gate until a replacement guard exists. Do not undo verified ownership or session security with a blind data restore. If corruption requires a backup restore, reconcile writes after the backup point and preserve audit evidence. Login by account ID and existing booking ownership are the availability baseline throughout.

Required release evidence: approved aggregate audit, case-resolution record, staging index/rollback rehearsal, distributed write-gate proof, concurrent-write tests, duplicate-key mapping, legacy-null compatibility, session/booking regressions, index inventory after deployment, and explicit production release approval. None is complete during this design task.
