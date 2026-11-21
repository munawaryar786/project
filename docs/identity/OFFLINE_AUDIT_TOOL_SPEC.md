# Synthetic-only offline identity collision classifier

**DO NOT EXECUTE AGAINST REAL CUSTOMER DATA WITHOUT SEPARATE PROJECT OWNER APPROVAL.** The utility at `scripts/identity/offline-collision-audit.cjs` was prepared but **not executed**. It is not a production-data audit, canonicalization authority, or database client. The earlier [real-data audit specification](LEGACY_COLLISION_AUDIT_SPEC.md) remains the separate approval path for any actual extraction.

## Isolation and input contract

The standalone CommonJS file imports only Node's `fs` module. It contains no MongoDB, Prisma, HTTP, Redis, provider, environment-variable, telemetry, or application imports; it is not in `package.json` or a workflow. It opens a file only after explicit `--synthetic-fixture <path.json> --ack-synthetic` arguments. The root JSON must declare `schema: "drivo-identity-synthetic-v1"` and `synthetic: true`; every account must declare `fixtureTag: "SYNTHETIC_ONLY"`. Unknown fields, including raw Passenger/Booking IDs and names, are rejected. Input is capped at 2 MiB and 10,000 synthetic accounts, with short per-field limits; any error produces a generic message and nonzero exit without a report. These checks cannot prove that a malicious or mistaken operator did not relabel real records as synthetic. Human control remains mandatory.

Illustrative **synthetic** input shape only (not a file created or processed in this task):

```json
{
  "schema": "drivo-identity-synthetic-v1",
  "synthetic": true,
  "accounts": [
    {
      "fixtureTag": "SYNTHETIC_ONLY",
      "rawPhone": "+1 202 555 0100",
      "normalizedPhone": "+12025550100",
      "canonicalPhone": "+12025550100",
      "phoneVerified": true,
      "accountEmail": "one@example.test",
      "emailEvidence": "UNKNOWN",
      "bookingCount": 2,
      "hasActiveSession": true,
      "hasOutstandingResetProof": false,
      "status": "ACTIVE",
      "bookingContactEmails": ["family@example.test"]
    },
    {
      "fixtureTag": "SYNTHETIC_ONLY",
      "rawPhone": "0012025550100",
      "normalizedPhone": "",
      "canonicalPhone": "+12025550100",
      "phoneVerified": false,
      "accountEmail": "two@example.test",
      "emailEvidence": "UNVERIFIED",
      "bookingCount": 1,
      "hasActiveSession": false,
      "hasOutstandingResetProof": false,
      "status": "ACTIVE",
      "bookingContactEmails": ["family@example.test"]
    }
  ]
}
```

`canonicalPhone` is fixture-supplied and structurally checked. The utility independently derives candidates only for explicit `+` and `00` international forms and rejects a mismatch with a supplied key. National forms are classified as needing country-rule review unless a synthetic fixture explicitly supplies a candidate; no `+421` inference or country-specific validation is claimed. `normalizedPhone` is historical-comparison input only. `emailEvidence` is fixture data; current Drivo Passenger rows have no verified-email field and must be treated `UNKNOWN` in any future real audit unless separate proof exists. Email grouping uses the current application's trim/whole-string lowercase candidate for collision illustration, not a final approved email key.

The output has only fixed aggregate categories: phone and email collision counts, raw-format variation, missing normalized phone, invalid/ambiguous phone, unknown email proof, shared booking-contact category, and review accounts with bookings, sessions or reset proofs. Every positive count below ten is `SUPPRESSED_1_TO_9`; larger counts are broad buckets. No row, raw identity, group key, hash, path, name, ID, contact address, token, or debug exception is printed. The tool has no filters, repeated-query API, export switch or network path. Its small-group suppression is not a substitute for privacy review: in a tiny population, category overlap and repeated runs with modified inputs can support inference. Never feed it customer records in this repository.

## Future authorized real-data workflow — separate tool and environment

Any real audit needs a distinct owner-approved extraction design, a restricted read-only database principal, no `DATABASE_URL` fallback, collection/field projection review, bounded scan/deadline, consistency statement, protected execution host, access logs, output suppression/complementary suppression review, and deletion/retention policy. Real records must never be copied into `E:\Project`, the sanitized CI repository, a Git repository, a fixture, chat, or this utility. The [real-data audit specification](LEGACY_COLLISION_AUDIT_SPEC.md) details categories and approvals. A synthetic tool run later would prove only its own classification behavior, not real collision counts, deployed index safety, phone ownership or account recovery correctness.
