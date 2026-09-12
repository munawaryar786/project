# Phase 3F Production Read-Only Query Plan (DO NOT RUN IN THIS GATE)

All examples are projection-only MongoDB reads against the Booking collection. They return counts, statuses, IDs and timestamps only; no addresses, contacts, names, coordinates or fare fields.

```javascript
const now = new Date();
const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
db.Booking.countDocuments({ pickupAt: { $gt: now, $lte: horizon }, scheduledRide: true });
db.Booking.aggregate([{ $match: { scheduledRide: true, pickupAt: { $gt: now } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
db.Booking.countDocuments({ scheduledRide: true, pickupAt: { $exists: false } });
db.Booking.find({ scheduledRide: true, driverId: { $exists: true, $ne: null }, pickupAt: { $gt: now } }, { _id: 1, driverId: 1, pickupAt: 1, status: 1 }).limit(500);
db.Booking.aggregate([{ $match: { scheduledRide: true, driverId: { $exists: true, $ne: null }, pickupAt: { $gt: now } } }, { $group: { _id: "$driverId", rides: { $push: { id: "$_id", pickupAt: "$pickupAt" } }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } } }]);
db.Booking.find({ scheduledRide: true, pickupAt: { $type: "date" } }, { _id: 1, driverId: 1, pickupAt: 1, returnDate: 1, returnTime: 1, recurrence: 1, recurrenceType: 1 }).limit(500);
db.Booking.find({ pickupAt: { $exists: true } }, { _id: 1, pickupAt: 1, marketTimezone: 1, scheduledRide: 1 }).limit(500);
db.Booking.getIndexes();
```

Before any synchronization, compare counts for malformed/null pickupAt, assigned future rides, overlapping driver windows, historical return/recurrence shapes, and existing indexes. Do not run these queries during Phase 3F release verification.