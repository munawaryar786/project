# Phase 3H Production Read-Only Audit Plan

Do not execute these queries in this implementation gate. They are projection/count-only MongoDB reads and exclude passenger names, contacts, addresses, coordinates, child/guardian/medical data, payment secrets, and free text.

- Active/nonterminal Booking counts by status, dispatchStatus, scheduledRide, driverId presence, and pickupAt windows.
- Unassigned immediate rides and dispatch-exhausted rides with only _id, bookingRef, driverId, status, dispatchStatus, pickupAt.
- RideRequest counts by booking/status/expiry, stale pending offers, and active-offer duplicate candidates.
- Driver presence distribution from status, isOnline, isOnTrip, lastHeartbeatAt, lastLocationReceivedAt; stale location uses the configured Phase 3B/3F threshold.
- Active assignments grouped by driver and booking status, including invalid driver references.
- Upcoming scheduled rides, missing driver, pickupAt, dispatchStatus, and readiness-failure event counts.
- OutboxEvent failed/retry/processing counts, oldest timestamps, eventType, aggregateType, aggregateId, attempts, lastError code only; never payload.
- AdminAuditEvent counts by action, targetType, adminId, requestId duplicate candidates, and createdAt; no safeMetadata export.
- DriverLedgerEntry counts by bookingId/idempotencyKey, orphan/wrong-driver/non-completed links, currency, entryType, and invariant candidates; no metadata/passenger joins.
- Vehicle usage/status, service profile usage, driver/vehicle invalid references, marketTimezone nulls, and new index compatibility.
- Read-only duplicate/collision check for AdminAuditEvent.requestId and any proposed unique/index changes.
Controlled rollout requires backup, audit review, duplicate/index preflight, owner approval, bounded schema/index synchronization, reconciliation, and rollback. No production query, db push, migration, seed, or backfill is part of Phase 3H implementation.
