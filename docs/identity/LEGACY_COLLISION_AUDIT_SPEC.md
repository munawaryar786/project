# DO NOT EXECUTE WITHOUT SEPARATE PROJECT OWNER APPROVAL

## Phase 3 passenger identity collision audit — non-executable specification

**Status:** specification only. No executable audit script is supplied, no database was contacted, and no real records or counts were obtained. A reviewed implementation, restricted read-only credential, and separate execution approval are required. The application `DATABASE_URL` must never be an implicit fallback.

### Why this remains a specification

Drivo directly depends on `mongodb`, but the current application environment uses a general `DATABASE_URL`, whose production privileges cannot be verified by source inspection. The exact canonicalization of historical raw international phones also needs fixtures and a bounded-memory implementation; a database-side string grouping on existing `normalizedPhone` alone would miss cross-format collisions. Shipping a runnable script now could give misleadingly complete results or accidentally use an overprivileged live credential. Implement and review the executable separately, then run it only after the owner authorizes data access.

### Required execution contract for a future implementation

* Require an explicit audit-only URI from a dedicated approved secret channel; refuse missing input, application `DATABASE_URL`/`REDIS_URL` fallback, non-approved cluster/database allowlist, and any command-line URI that would appear in process listings. Never log or persist the URI. Use a database principal with read-only access to the specific database/collections; confirm its permissions separately before use.
* Source may call only `find`, `aggregate`, `countDocuments`, or equivalent read operations on Passenger, Booking, PassengerSession, and verification-proof collections. No `create`, `update`, `delete`, `upsert`, `bulkWrite`, `createIndex`, `$out`, `$merge`, migration, or provider call. Use a projection of only the fields necessary to derive categories. No customer document export.
* Use `readPreference: secondaryPreferred` only if an approved topology and acceptable lag are documented; otherwise primary read-only with bounded workload. Do not assume a consistent snapshot across collections without an approved read concern/transaction strategy. Record scan start/end and a `consistency: approximate` flag if writes can occur concurrently.
* Use cursor batches no larger than 250, `maxTimeMS` per server operation, overall deadline, an explicit account-document cap and 128 MiB process-memory ceiling. Abort with a failure status and **no partial category report** if limits are exceeded. Do not request server disk spill by default. These caps are proposed guardrails, not proven suitable for the real dataset.
* Do not print raw phone, email, name, account ID, booking ID, proof/session token, raw hash, or any individual-level row to stdout, stderr, logs, telemetry, or report files. Scrub driver exceptions before output; never stringify query objects or documents. Keep temporary keys in memory only and discard them at exit. Do not send results to external services.
* Exit nonzero for credential/isolation failure, query timeout, resource cap, unexpected schema, inconsistent scan, or privacy-suppression failure. A successful report must include source version, approved normalization version, dataset boundary, completion flag, suppression policy, and no secrets.

### Read-only derivation plan

1. Review `prisma/schema.prisma`, the deployed index inventory, and a synthetic normalization fixture set before querying. Use the **approved** canonicalizer, not ad hoc `$regex` transformations. For each minimal Passenger projection, classify raw phone as missing, invalid, ambiguous country context, or canonical E.164. Treat stored `normalizedPhone` separately and record disagreement as a category. Never infer a default +421 from an already international legacy value. Hold in-memory keyed counts only within the reviewed resource cap; abort if it cannot complete.
2. Count canonical-phone groups with two or more distinct Passenger records. Separately count raw-format collisions and missing/invalid stored normalized fields. Classify phone verification using `phoneVerified`/`phoneVerifiedAt` only as recorded evidence; do not infer control of a phone for other accounts or current control from old verification.
3. Normalize account email conservatively for the proposed policy, while also counting using the **current** trim/lowercase behavior. Report duplicate normalized account-email groups, invalid/missing email, and groups containing password-enabled accounts. Since no email-verification state exists, classify every existing account email as `verification_not_recorded`, not verified. Do not treat repeated `Booking.customerEmail` as an account collision.
4. For accounts in conflict groups, derive aggregate counts by active/inactive account state and password-enabled state, and counts of accounts with bookings, active sessions, or outstanding reset proofs. Query by account ID internally using bounded batches or an approved aggregation; never emit those IDs. Report only `has_any`/count categories, no booking or session details. If joins cannot be performed within limits, mark the dimension **UNVERIFIED** rather than estimating.
5. Run a separate aggregate-only booking-contact check: count shared contact emails across bookings as an expected compatibility category, not a violation. No customer contact values or per-family group sizes leave the process.
6. Run under an approved consistency window, then repeat the collision scan immediately before any future index build. Do not interpret a zero-collision result as proof that concurrent writes cannot create new collisions without a database-enforced guard.

### Privacy rule and output schema

Set `k = 10`. For each cell with 1–9 affected accounts, print `SUPPRESSED` rather than an exact number. If a total and other cells would reveal the suppressed value, suppress the total or another cell as complementary suppression. Never emit a list of collision keys, account IDs, or group sizes. Zero may be printed. Large counts may be bucketed (`10–49`, `50–99`, `100+`) if linkage across dimensions creates disclosure risk. Do not add small geographic, time, language, or demographic breakdowns.

The final report should contain only: `audit_version`, `source_revision`, `normalizer_version`, `completed`, `consistency`, broad passenger-volume bucket, and these category cells: `canonical_phone_collision_accounts`, `canonical_phone_collision_groups`, `raw_format_collision_accounts`, `missing_normalized_phone`, `invalid_or_ambiguous_phone`, `stored_canonical_disagreement`, `phone_verification_not_recorded`, `normalized_account_email_collision_accounts`, `normalized_account_email_collision_groups`, `invalid_account_email`, `missing_account_email`, `email_verification_not_recorded`, `collision_active_accounts`, `collision_password_enabled_accounts`, `collision_accounts_with_bookings`, `collision_accounts_with_sessions`, `collision_accounts_with_reset_proofs`, `shared_booking_contact_email_bookings`. Mark unavailable cells `UNVERIFIED` with a non-identifying reason.

**Synthetic shape only — these are invented examples, not Drivo findings:**

```json
{
  "audit_version": "proposal-1",
  "source_revision": "reviewed-build-placeholder",
  "normalizer_version": "approved-fixture-set-placeholder",
  "completed": true,
  "consistency": "approximate",
  "passenger_volume_bucket": "100+",
  "canonical_phone_collision_accounts": "10-49",
  "canonical_phone_collision_groups": "SUPPRESSED",
  "normalized_account_email_collision_accounts": "0",
  "email_verification_not_recorded": "100+",
  "collision_accounts_with_bookings": "SUPPRESSED",
  "shared_booking_contact_email_bookings": "50-99"
}
```

### Review and approval gates

Before implementation: owner approves canonicalization fixtures, email-key semantics, resource ceilings, suppression review, exact query plan, collections, and audit-only credential scope. Before execution: separately approve environment, operator, time window, credential source, access-log handling, and aggregate report destination. After execution: compare total scanned counts to a separately approved control count, verify no resource cap was hit, inspect output for suppression leakage, and share only the aggregate result. Any individual case review or remediation needs another authorization. No executable script should be run from this specification as-is.
