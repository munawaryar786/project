# PHASE 3K SCHEMA / INDEX MATRIX

Production database access was not authorized or proven in this environment. Every `Current production evidence` cell is therefore `MANUAL VERIFICATION REQUIRED`; no collection was queried and no index was changed.

| Phase | Prisma model / Mongo collection | Field or required index | Current production evidence | Required state | Preflight required | Backfill required | Risk | Action later |
|---|---|---|---|---|---|---|---|---|
| 3B | `Driver` (default collection name; no `@@map`) | `currentLat`, `currentLng`, location/heartbeat fields; indexes `status`, `isOnline`, `isOnTrip`, `vehicleId`, `lastHeartbeatAt` | MANUAL | Fields readable and indexes compatible | Inspect field sparsity and index metadata | Optional compatibility for legacy null telemetry | stale presence and query cost | Review counts, then controlled sync if approved |
| 3B | `RideRequest` → `ride_requests` | unique `(bookingId, driverId)` plus `bookingId`, `driverId`, `status`, `expiresAt` indexes | MANUAL | One logical offer per booking/driver | Aggregate duplicate groups before unique index work | Manual remediation if duplicates exist; never delete in audit | unique-index build failure / offer races | Resolve duplicates under separate approved procedure, then sync |
| 3B | `OutboxEvent` → `outbox_events` | unique `idempotencyKey`; indexes `(aggregateType,aggregateId)`, `(state,createdAt)`, `(state,nextAttemptAt,createdAt)` | MANUAL | Durable event and retry lookup | Inspect duplicate keys and index metadata | Optional compatibility for legacy events | duplicate delivery or stuck relay | Backup, remediate, sync, verify |
| 3C | Existing `Booking`, `RideRequest`, `Driver`, `OutboxEvent` | No direct Prisma schema delta | MANUAL | Uses 3B foundation | Dispatch duplicate/state review | None expected | dispatch state inconsistency | Staging race evidence and controlled review |
| 3D | `OutboxEvent` → `outbox_events` | `attempts`, `claimedAt`, `lastError`, `nextAttemptAt`; retry index | MANUAL | Retry/recovery fields and index present | Count missing/null legacy fields and inspect indexes | Optional compatibility for old events; no blind defaulting | lost retries or permanent failure | Backfill only with approved derived procedure |
| 3D | `Notification` → `notifications` | unique `dedupeKey`; indexes `(recipientType,recipientId,createdAt)` and `(recipientType,recipientId,readAt)` | MANUAL | Idempotent notification persistence | Aggregate duplicate dedupe keys and inspect indexes | Manual remediation if duplicates | duplicate/missing admin alerts | Resolve under separate phase |
| 3E | Existing `Booking`, `Driver` | No direct Prisma schema delta; navigation reads coordinates/location timestamps | MANUAL | Existing fields and route-provider compatibility | Inspect null/stale location rates | None expected | navigation unavailable/stale GPS | Staging/mobile/provider evidence |
| 3F | `Booking` (default collection name) | `scheduledRide`, `pickupAt`, `marketTimezone`, related scheduling fields; index `pickupAt` | MANUAL | Fields present and pickupAt index available | Count legacy scheduled rows missing derived fields; inspect index | Optional compatibility or derived backfill for legacy scheduled rows | missed reminders/claims | Separate reviewed backfill, then sync |
| 3F | `RideRequest` → `ride_requests` | Reuses offer uniqueness/state indexes for scheduled recovery | MANUAL | Same unique offer invariant | Duplicate preflight and state audit | None beyond 3B | competing scheduled offers | Staging claim race |
| 3G | `DriverLedgerEntry` → `driver_ledger_entries` | unique `idempotencyKey`; indexes `(driverId,effectiveAt)`, `bookingId`, `referenceId`, `entryType` | MANUAL | Append-only ledger and idempotency | Aggregate duplicate keys/orphan references; inspect indexes | Manual remediation only for legacy data | duplicate financial entries / index failure | Reconcile read-only, then controlled remediation |
| 3H | `AdminAuditEvent` → `admin_audit_events` | unique `requestId`; indexes `(adminId,createdAt)`, `(targetType,targetId,createdAt)`, `(action,createdAt)` | MANUAL | Immutable admin audit trail | Aggregate duplicate request IDs and inspect indexes | None expected; manual remediation for conflicts | loss of auditability | Resolve conflicts before sync |
| 3I | `EmailDelivery` → `email_deliveries` | unique `logicalKey`; indexes `(kind,status,createdAt)` and `(status,createdAt)`; fields `attempts`, `lastError`, `sentAt` | MANUAL | Idempotent delivery state and retry visibility | Count rows, duplicate logical keys, stale PROCESSING/FAILED; inspect indexes | Optional compatibility for legacy rows; manual remediation for duplicates | duplicate/missing emails | Separate email-delivery preflight/remediation |
| 3J | `OTP` (default collection name) and `PassengerVerificationProof` → `passenger_verification_proofs` | Existing metadata/sentinel fields; unique `proofTokenHash`; proof indexes | MANUAL | Verify provider is authority; local record stores metadata only | Inspect counts/status/expiry without tokens or phone values | None expected; do not backfill OTP codes | auth recovery inconsistency | Provider/staging validation only |
| 3J | `Passenger` (default collection name) | unique `phone`; indexes `email`, `phoneVerified`, `normalizedPhone`; normalized identity compatibility | MANUAL | Canonical phone/email collision-free | Aggregate normalized collisions and inspect indexes | Manual remediation for collisions | account lockout/duplicate identity | Dedicated identity remediation |
| 3F–3J | Scheduled ride related models | No separate scheduled model; `Booking` scheduling fields plus `RideRequest` offers and outbox/notification records | MANUAL | Existing model set is authoritative | Inspect all related collections/indexes | As above, only approved derived backfill | orphaned schedules or claims | Review as one controlled change set |

## Collection mapping notes

- `@map("_id")` maps every model id to Mongo `_id`.
- Models without `@@map` use Prisma's model collection name (for example `Booking`, `Passenger`, `PricingSettings`, `Driver`, `AdminUser`).
- Explicit mappings are `passenger_otps`, `passenger_sessions`, `passenger_trusted_devices`, `passenger_verification_proofs`, `driver_earnings`, `driver_ledger_entries`, `driver_locations`, `ride_requests`, `outbox_events`, `email_deliveries`, `notifications`, `admin_audit_events`, `pricing_distance_tiers`, `service_pricing_profiles`, and `commission_configs`.
- The brief's `PricingTier` is implemented as `PricingDistanceTier` and maps to `pricing_distance_tiers`.
- There is no PostgreSQL datasource or migration in this release.

## Required controlled sequence

1. Take and verify a provider backup/snapshot; record timestamp and operator.
2. Run the duplicate and current-index read-only preflights.
3. Review conflicts and approve any manual remediation/backfill.
4. Apply only the reviewed schema/index synchronization.
5. Reinspect indexes and counts.
6. Deploy the reviewed application artifact.
7. Run smoke and rollback checks.

No step above was executed in Phase 3K.
