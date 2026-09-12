# PHASE 3I PRODUCTION READ-ONLY QUERY PLAN

Status: prepared for project-owner review. This document is a query plan only. Do not execute from the application, CI, deployment shell, or production database without an approved maintenance window and a separately reviewed operator procedure.

## Guardrails

- Read-only sessions only; use a least-privilege reporting role with statement timeout and row limits.
- Return counts, hashes, timestamps, enum/status values, and booking references only where operationally required. Never return passwords, password hashes, OTP codes, proof tokens, reset tokens, session tokens, trusted-device tokens, full phone numbers, or full email addresses.
- Redact or hash passenger identifiers and addresses in exported output. Do not copy production rows into logs, tickets, chat, or test fixtures.
- Do not run Prisma migrate, db push, seed, update, delete, repair, or index commands as part of this plan.
- Record query text, execution timestamp, database name, operator, row cap, and result count in the change record.

## Query groups

1. **Passenger account identity and duplicates**: count ACTIVE/PENDING/LOCKED passengers by status; find duplicate normalizedPhone values; find duplicate lower-cased email values; find phone/email collisions across passenger accounts; report only hashed identifiers and counts.
2. **Verification state**: count phoneVerified, phoneVerifiedAt, email presence, passwordHash presence, authVersion distribution, lastLoginAt and passwordResetAt nullability; identify accounts with inconsistent verified flags without exposing secrets.
3. **Incomplete registrations**: find bookings with passengerAuthStatus in the incomplete states, missing passengerId, missing normalizedPhone, stale passengerAuthCompletedAt, or an authenticated booking with no matching passenger; return bookingRef hash, status, and age.
4. **Password reset compatibility**: count active PassengerVerificationProof rows by purpose, consumedAt, expiry, resetAttemptId presence, and passengerId presence; verify legacy PASSENGER_PASSWORD_RESET rows remain queryable and email reset rows use PASSENGER_PASSWORD_RESET_EMAIL; never select proofTokenHash values.
5. **Booking confirmation and invoice idempotency**: count CONFIRMED bookings by payment method and customer email presence; compare confirmed booking references to EmailDelivery logicalKey prefix BOOKING_CONFIRMATION_INVOICE; report missing, duplicate, SENT, RETRY, FAILED, and PROCESSING counts without recipient values.
6. **Email delivery health**: group EmailDelivery by kind/status/attempts and age; find PROCESSING rows older than the retry policy; find FAILED rows and error categories after redaction; compare reset and escalation logical keys to their source records.
7. **Dispatch exhaustion and admin escalation**: count DISPATCH_EXHAUSTED outbox events, bookings, admin notifications, and NO_DRIVER_ADMIN_ESCALATION delivery records; detect exhausted events without an admin notification or email record; return bookingRef hashes and timestamps only.
8. **Outbox and realtime health**: group outbox events by state/eventType, age, retry count, and nextAttemptAt; identify stale PROCESSING/RETRY rows and duplicate event identities; inspect DRIVER_OFFER_ACCEPTED and DISPATCH_EXHAUSTED coverage without payload secrets.
9. **Pricing authority**: report active PricingSettings rows, active PricingTier rows by service/ride type, currency, effective dates, and duplicate precedence candidates; do not alter settings.
10. **Distance and fare integrity**: find bookings with null, negative, non-finite, or implausibly large distanceKm; flag the known 136 km anomaly cohort for review; compare stored fare components, fareTotalFare, estimatedPrice, currency, and payment amount; output bookingRef hashes and numeric deltas only.
11. **Payment safety**: count card bookings by paymentStatus and Stripe payment intent presence; find CONFIRMED card bookings without a verified webhook transition or with duplicate receipt attempts; never output payment secrets or full customer data.
12. **Index and collision preflight**: inspect existing indexes and uniqueness constraints for passenger normalizedPhone, phone, email, bookingRef, EmailDelivery.logicalKey, and proof lookup fields; report collisions before any future migration proposal.

## Release interpretation

- Any duplicate identity, orphaned authenticated booking, stale PROCESSING delivery, missing confirmed invoice record, exhausted dispatch without admin coverage, malformed distance, fare mismatch, payment mismatch, or index collision blocks production release until triaged.
- The plan must be rerun after staging E2E and immediately before production cutover. Production execution and any remediation remain outside Phase 3I implementation scope.