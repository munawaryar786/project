# Phase 3B production read-only checks

Prepared for a separately authorized pre-deployment inspection. **NOT RUN.** Use the intended database and a read-only account. These return internal identifier pairs, counts, types, status labels and collection/index metadata only; no passenger contacts, addresses, payloads or booking documents. Read-only aggregations still consume resources; maxTimeMS bounds execution and a timeout is not a clean audit result.

## A. All historical duplicate RideRequest pairs

The unique key covers every status, including expired, cancelled, declined and accepted history. Null and missing key parts are normalized together because missing index values behave like null. Both ascending index keys are required: `{ bookingId: 1, driverId: 1 }`, unique: true. Do not create it here.

```javascript
db.getCollection("ride_requests").aggregate([
  { $group: {
      _id: {
        bookingId: { $ifNull: ["$bookingId", null] },
        driverId: { $ifNull: ["$driverId", null] }
      },
      count: { $sum: 1 }
  }},
  { $match: { count: { $gt: 1 } } },
  { $project: { _id: 0, bookingId: "$_id.bookingId", driverId: "$_id.driverId", count: 1 } }
], { allowDiskUse: false, maxTimeMS: 60000 });
```

Consume the complete cursor before concluding there are no duplicates. Do not limit results and treat that as a full audit. No automatic deletion or deduplication is authorized.

Check key types separately, since Prisma expects required ObjectIds; missing, null, arrays and other types need investigation even without duplicate pairs:

```javascript
db.getCollection("ride_requests").aggregate([
  { $group: {
      _id: { bookingIdType: { $type: "$bookingId" }, driverIdType: { $type: "$driverId" } },
      count: { $sum: 1 }
  }}
], { allowDiskUse: false, maxTimeMS: 60000 });
```

## B. Booking status and assignment compatibility

```javascript
db.getCollection("Booking").aggregate([
  { $group: {
      _id: {
        status: { $ifNull: ["$status", "<missing/null>"] },
        hasAssignedDriver: { $ne: [{ $ifNull: ["$driverId", null] }, null] }
      },
      count: { $sum: 1 }
  }},
  { $sort: { "_id.status": 1, "_id.hasAssignedDriver": 1 } }
], { allowDiskUse: false, maxTimeMS: 60000 });
```

Compare assigned states with PENDING, ASSIGNED, CONFIRMED, SEARCHING_DRIVER, DRIVER_ENROUTE, ARRIVED and IN_PROGRESS. COMPLETED, CANCELLED and NO_SHOW are terminal. Unknown states and assigned PENDING/SEARCHING_DRIVER records require an owner-reviewed compatibility decision; do not rewrite them automatically.

## C. RideRequest status distribution

```javascript
db.getCollection("ride_requests").aggregate([
  { $group: { _id: { $ifNull: ["$status", "<missing/null>"] }, count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
], { allowDiskUse: false, maxTimeMS: 60000 });
```

## D. Outbox existence and required index metadata

```javascript
db.getCollectionInfos({ name: "outbox_events" }, true);
db.getCollection("ride_requests").getIndexes();
db.getCollection("Driver").getIndexes();
// Only if outbox_events exists:
db.getCollection("outbox_events").getIndexes();
```

If an outbox already exists, verify types without returning event payloads or idempotency values:

```javascript
db.getCollection("outbox_events").aggregate([
  { $group: {
      _id: {
        id: { $type: "$_id" },
        eventType: { $type: "$eventType" },
        aggregateType: { $type: "$aggregateType" },
        aggregateId: { $type: "$aggregateId" },
        idempotencyKey: { $type: "$idempotencyKey" },
        payload: { $type: "$payload" },
        state: { $type: "$state" },
        createdAt: { $type: "$createdAt" },
        publishedAt: { $type: "$publishedAt" }
      },
      count: { $sum: 1 }
  }}
], { allowDiskUse: false, maxTimeMS: 60000 });

db.getCollection("outbox_events").aggregate([
  { $group: { _id: { $ifNull: ["$idempotencyKey", null] }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $group: { _id: null, duplicateGroups: { $sum: 1 }, documentsInDuplicateGroups: { $sum: "$count" } } },
  { $project: { _id: 0, duplicateGroups: 1, documentsInDuplicateGroups: 1 } }
], { allowDiskUse: false, maxTimeMS: 60000 });
```

No schema synchronization, collection creation, update, deletion, seed, production transaction test or production connection was performed by this release gate.
