# Phase 3B booking stale-update audit

The Mongo Prisma Booking model has no numeric version field. This phase uses conditional writes in `prisma.$transaction(async tx => ...)`; it does not add a version field.

- Offer CAS requires the authenticated driver's own PENDING offer and expiresAt > server time.
- Booking CAS requires an explicitly null OR missing driverId and PENDING/CONFIRMED/SEARCHING_DRIVER; PENDING CARD is excluded.
- Driver CAS requires ACTIVE, online and isOnTrip false. This shared document serializes the same driver's simultaneous claims for different bookings.
- Active-trip checks run inside acceptance using the same central statuses as presence derivation, including overdue assignments.
- Lifecycle CAS requires exact current predecessor and authenticated assignment. Repeated/illegal commands fail with 409.
- Completion performs the existing earning upsert, driver busy-state derivation, pending-offer expiry and outbox insert within the SAME transaction. Any failure rolls all of them back. Offline intent is not changed.
- P2034 maps to STATE_CONFLICT (409); other transaction failures map to TRANSACTION_UNAVAILABLE (503). No nontransactional fallback or automatic retry exists.

The proof covers these controlled offer/lifecycle services. It is not a claim that unrelated legacy admin writers are universally serialized by a new database-wide invariant.

67 static/source assertions and 45 isolated behavioral cases exercise the foundation. The concurrency cases use a mocked transaction store with revision conflicts; they are NOT real Mongo integration tests. A transaction-capable staging Mongo race and rollback test remains a deployment prerequisite.
