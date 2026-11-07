"use strict";

// Read-only triage limited to bookings associated with failed created-email
// events. Does not process bookings, retry emails, connect to Redis/BullMQ,
// expose PII or make any database modifications.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const dir = path.resolve(process.argv[2] || process.cwd());
const config = {};
for (const filename of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  const file = path.join(dir, filename);
  if (fs.existsSync(file)) Object.assign(config, dotenv.parse(fs.readFileSync(file)));
}
Object.assign(config, process.env);
function known(value, options) { return options.includes(value) ? value : "OTHER"; }
const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
async function main() {
  console.log("===== DRIVO STALE FAILED-EMAIL BOOKING REVIEW (READ ONLY) =====");
  if (!config.DATABASE_URL) throw Error("DATABASE_URL_MISSING");
  process.env.DATABASE_URL = config.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const failed = await db.outboxEvent.findMany({
      where: { state: "FAILED", eventType: "BOOKING_EMAIL_CREATED" },
      select: { aggregateId: true },
      take: 100,
    });
    const uniqueIds = [...new Set(failed.map(x => x.aggregateId))];
    console.log("FAILED CREATED-EVENT BOOKING REFERENCES REVIEWED:", uniqueIds.length);
    if (!uniqueIds.length) return;
    const bookings = await db.booking.findMany({
      where: { id: { in: uniqueIds }, status: "PENDING", pickupAt: { lt: ago24h } },
      select: {
        status: true, bookingSource: true, paymentMethod: true,
        phoneVerified: true, passengerAuthStatus: true, passengerId: true,
        cashAgreed: true, driverId: true, dispatchStatus: true,
        scheduledRide: true, updatedAt: true,
      },
    });
    console.log("PAST-DUE PENDING BOOKINGS:", bookings.length);
    const groups = new Map();
    let unverified = 0, verified = 0, driverAssigned = 0;
    for (const row of bookings) {
      const verifiedOwner = row.phoneVerified === true &&
        row.passengerAuthStatus === "AUTHENTICATED" && Boolean(row.passengerId);
      if (verifiedOwner) verified++; else unverified++;
      if (row.driverId) driverAssigned++;
      const summary = [
        "source=" + known(row.bookingSource, ["WEB", "PHONE_DISPATCH"]),
        "auth=" + (verifiedOwner ? "VERIFIED_OWNER" : "NOT_FULLY_VERIFIED"),
        "payment=" + known(row.paymentMethod, ["CARD", "CASH", "INVOICE"]),
        "dispatch=" + known(row.dispatchStatus, [
          "NOT_STARTED", "SEARCHING", "SEARCHING_DRIVER", "DISPATCH_EXHAUSTED",
          "ASSIGNED", "PENDING", "COMPLETED", "FAILED",
        ]),
        "driver=" + (row.driverId ? "ASSIGNED" : "NONE"),
        "scheduled=" + Boolean(row.scheduledRide),
      ].join(" ");
      groups.set(summary, (groups.get(summary) || 0) + 1);
    }
    console.log("VERIFIED PASSENGER OWNER:", verified);
    console.log("NOT FULLY VERIFIED:", unverified);
    console.log("DRIVER ASSIGNED:", driverAssigned);
    console.log("BREAKDOWN (COUNTS ONLY):");
    for (const [key, n] of [...groups].sort((a,b) => a[0].localeCompare(b[0])))
      console.log(key + " count=" + n);
    if (bookings.length === 0) console.log("NO MATCHING STALE PENDING BOOKINGS");
    console.log("ACTION: MANUAL REVIEW ONLY; DO NOT AUTO-RESEND OR CHANGE STATUSES");
    console.log("AUDIT: DONE; NO WRITES, EMAIL SENDS OR QUEUE ACCESS");
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error("AUDIT: FAILED", error?.message === "DATABASE_URL_MISSING" ? "DATABASE_URL_MISSING" : "DB_READ_UNAVAILABLE");
  process.exitCode = 1;
});
