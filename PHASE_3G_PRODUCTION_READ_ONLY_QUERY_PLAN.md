# Phase 3G Production Read-Only Query Plan (DO NOT RUN IN THIS GATE)

All queries are projection/count-only MongoDB reads. Do not return passenger names, contacts, addresses, coordinates, medical fields, payment data, or free-text notes.

```javascript
const completed = { status: "COMPLETED" };
db.Booking.countDocuments(completed);
db.Booking.find(completed, { _id: 1, driverId: 1, bookingRef: 1, fareTotalFare: 1, estimatedPrice: 1, paymentMethod: 1, earning: 1 }).limit(500);
db.Booking.aggregate([{ $match: completed }, { $group: { _id: "$driverId", count: { $sum: 1 }, totalFareRows: { $sum: 1 } } }]);
db.Booking.find({ ...completed, earning: { $exists: false } }, { _id: 1, driverId: 1, bookingRef: 1 }).limit(500);
db.driver_earnings.aggregate([{ $group: { _id: "$bookingId", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
db.driver_ledger_entries.aggregate([{ $group: { _id: "$idempotencyKey", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
db.driver_ledger_entries.find({}, { _id: 1, driverId: 1, bookingId: 1, entryType: 1, currency: 1, grossAmountMinor: 1, commissionAmountMinor: 1, netAmountMinor: 1, idempotencyKey: 1, effectiveAt: 1 }).limit(1000);
db.driver_ledger_entries.aggregate([{ $lookup: { from: "bookings", localField: "bookingId", foreignField: "_id", as: "booking" } }, { $match: { "booking.status": { $ne: "COMPLETED" } } }, { $project: { _id: 1, bookingId: 1, driverId: 1, entryType: 1 } }]);
db.driver_ledger_entries.aggregate([{ $lookup: { from: "bookings", localField: "bookingId", foreignField: "_id", as: "booking" } }, { $match: { $expr: { $ne: ["$driverId", { $arrayElemAt: ["$booking.driverId", 0] }] } } }, { $project: { _id: 1, bookingId: 1, driverId: 1 } }]);
db.pricing_settings.find({ key: "default" }, { _id: 1, globalDefaultCommission: 1 });
db.commission_configs.find({ active: true }, { _id: 1, scope: 1, scopeId: 1, commissionRate: 1 });
db.Booking.aggregate([{ $match: completed }, { $project: { _id: 1, fareTotalFare: 1, estimatedPrice: 1 } }, { $match: { $or: [{ fareTotalFare: null }, { estimatedPrice: null }] } }]);
db.driver_earnings.find({ $or: [{ driverAmount: { $lt: 0 } }, { totalFare: { $lt: 0 } }] }, { _id: 1, bookingId: 1, driverId: 1, driverAmount: 1, totalFare: 1 });
db.driver_earnings.find({ $or: [{ driverAmount: 0 }, { totalFare: 0 }] }, { _id: 1, bookingId: 1, driverId: 1, driverAmount: 1, totalFare: 1 }).limit(500);
db.Driver.find({}, { _id: 1, phone: 0, email: 0 });
db.driver_ledger_entries.getIndexes();
```

## Controlled historical backfill plan (not executed)

1. Backup and snapshot. 2. Run the read-only audit. 3. Calculate candidate ledger entries from completed bookings and legacy DriverEarning values. 4. Compare totals per driver and currency. 5. Dry-run totals and anomaly report. 6. Obtain project-owner approval. 7. Run bounded idempotent backfill using `trip-earning:<bookingId>`. 8. Reconcile counts and totals. 9. Keep rollback by restoring the snapshot and isolating inserted ledger records. No development or production backfill is performed in Phase 3G implementation.