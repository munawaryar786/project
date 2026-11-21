# Canonical verified phone identity policy

**Design only.** The owner approved one account per **verified** canonical E.164 phone. The current source stores raw `Passenger.phone @unique`, optional non-unique `normalizedPhone`, and `phoneVerified`/`phoneVerifiedAt` (`prisma/schema.prisma:154-180`). Neither the raw uniqueness declaration nor a phone-looking string proves one verified owner. See [approved policy](PHASE3_IDENTITY_POLICY.md).

## Current behavior and compatibility

`lib/passenger-auth.ts:30-47` trims a string, deletes spaces, parentheses, dots and hyphens, strips all other non-digits, accepts leading `+` or `00`, otherwise prefixes a context that defaults to `+421` after dropping all leading zeroes. Its E.164 regex verifies only `+` and 8–15 digits. It does not validate national numbering plans, mobile/landline classification, trunk-prefix rules, extensions, or current assignability. Some malformed inputs can be silently transformed. The public booking form offers `+421,+420,+43,+49,+44,+92`; dispatcher booking offers `+421,+420,+49,+44,+380`. These are UI contexts, not validated country coverage. A non-Slovak legacy phone without an explicit prefix must never be assumed Slovak.

## Proposed deterministic input contract

| Input class | Proposed handling | Authority |
| --- | --- | --- |
| Explicit `+` plus country code and national significant number | Permit only reviewed formatting separators; reject letters, extra plus, extensions and control characters; parse once and validate E.164 plus country-specific rules. | Fresh provider OTP to the resulting key before claiming it. |
| International `00` prefix | Convert to `+` only if exactly one valid international prefix and reviewed country-specific parsing succeeds. | Same OTP requirement. |
| National number with explicitly selected country context | Parse with that context, applying that country's trunk rules; do not blindly strip all leading zeroes. | Same OTP requirement. |
| National number without trustworthy context | `AMBIGUOUS_CONTEXT`; request country choice or manual review. New UI may retain +421 preselection only when explicitly visible/confirmed. | No identity key. |
| Historical raw/stored normalized value | Compare original raw, country evidence, stored normalized value and prior proof provenance. If inconsistent/ambiguous, leave identity key unset and flag exception. | No automatic re-verification or merge. |
| Invalid length/syntax/country pattern | Return a generic localized validation result; retain old account identity and bookings. | No claim, no silent rewrite. |

Canonical key format is an E.164 string such as `+12025550100` in synthetic fixtures only. Do not use phone display formatting as the database key. The canonicalizer should return `{status: VALID|INVALID|AMBIGUOUS_CONTEXT|UNSUPPORTED_COUNTRY, e164?, parserVersion, countryContext?}` and never a guessed key on failure. Structural E.164 validity and country-specific validity must remain distinct evidence. A reviewed mature phone parser with versioned metadata is likely needed for the country-specific requirement; no dependency is installed or approved here. The owner must approve library choice, metadata update policy, country support and migration fixtures before implementation.

## Verification and claims

Proposed additive fields after approval: `Passenger.verifiedCanonicalPhone String?` and `Passenger.verifiedCanonicalPhoneAt DateTime?`, with a version/attempt marker if needed for phone changes. Populate the key only after a booking-bound or account-bound OTP proof verifies control of **that exact canonical number**, the proof is unexpired and single-use, and no different account already owns the key. The claim and proof consumption must commit together with a database unique constraint. Current `phoneVerified` may record historical phone verification but is not by itself proof that a newly computed canonical key is owned now. Do not automatically backfill verified keys from raw `phone`, old OTP rows or normalized values.

For a number change, require a live authenticated account, CSRF, recent step-up if approved, verification of the proposed new number, transactionally fenced proof consumption and unique claim, then revoke or rotate sessions under an owner-approved policy. Keep the previous verified key until the new claim succeeds; failure leaves it intact. Do not modify a booking's contact phone or owner as a side effect. Number reassignment by a telecom provider can make old OTP evidence stale; offer safe account recovery rather than treating current possession as permission to merge another account.

Concurrent registrations must rely on the unique database key, not `findFirst` or a lookup-before-create precheck. A duplicate-key result is handled generically, without revealing which account owns the phone. While legacy collisions remain unresolved, an exception workflow may prevent new claims to an ambiguous key but must preserve existing account-ID sessions and bookings. The desired global one-account invariant is **not achieved** until all conflicting verified claims are resolved and the index is enforced.

## Synthetic-only examples and deferred checks

Examples use reserved fictional numbering patterns: `+1 202 555 0100` and `0012025550100` are candidate forms of the same structural key; `2025550100` without an explicit `+1` context is ambiguous. These examples do not prove country validity. Required fixtures include SK/CZ/AT/DE/UK/UA/PK national and international forms, leading-zero behavior, malformed plus/prefix, Unicode digits, extensions, short numbers, and historical raw-versus-normalized disagreement. Test against a reviewed parser and disposable MongoDB concurrency setup only after separate approval. The [offline synthetic tool](OFFLINE_AUDIT_TOOL_SPEC.md) deliberately performs structural grouping, not authoritative telephone-number validation.
