"use strict";

/*
 * READ ONLY: summarize current booking state for historically failed
 * BOOKING_EMAIL_CREATED events. Never sends/resends email, connects to Redis,
 * changes outbox state, or prints any booking/contact identifiers.
 */
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("dotenv");

function snapshotConfig(directory) {
  const config = {};
  for (const name of [".env", ".env.production", ".env.local", ".env.production.local"]) {
    const file = path.join(directory, name);
    if (fs.existsSync(file)) Object.assign(config, parse(fs.readFileSync(file)));
  }
  return { ...config, ...process.env };
}
function marketDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [map.year, map.month, map.day].join("-");
}
function pickupWindow(row, currentMarketDate) {
  if (row.pickupAt instanceof Date && Number.isFinite(row.pickupAt.getTime())) {
    const diff = row.pickupAt.getTime() - Date.now();
    return diff < -86400000 ? "PAST_OVER_24H" : diff > 86400000 ? "FUTURE_OVER_24H" : "WITHIN_24H";
  }
  const date = row.scheduledDate;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "DATE_UNKNOWN";
  return date < currentMarketDate ? "PAST_DATE" : date > currentMarketDate ? "FUTURE_DATE" : "TODAY_DATE";
}
function safeStatus(value) {
  return ["PENDING", "CONFIRMED", "SEARCHING_DRIVER", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(value)
    ? value : "OTHER";
}
const config = snapshotConfig(path.resolve(process.argv[2] || process.cwd()));

async function main() {
  console.log("===== FAILED CREATED-BOOKING EMAIL REVIEW (READ ONLY) =====");
  if (!config.DATABASE_URL) throw new Error("MISSING_DB");
  process.env.DATABASE_URL = config.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const where = { state: "FAILED", eventType: "BOOKING_EMAIL_CREATED" };
    const count = await db.outboxEvent.count({ where });
    const failed = await db.outboxEvent.findMany({
      where,
      select: { aggregateId: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const dateToday = marketDate();
    const summary = new Map();
    let noEmail = 0;
    let hasEmail = 0;
    let bookingMissing = 0;
    let reviewed = 0;
    const uniqueBookings = new Set();
    for (const row of failed) {
      uniqueBookings.add(row.aggregateId);
      const booking = await db.booking.findUnique({
        where: { id: row.aggregateId },
        select: { status: true, pickupAt: true, scheduledDate: true, customerEmail: true, bookingSource: true },
      });
      reviewed++;
      if (!booking) { bookingMissing++; continue; }
      if (booking.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.customerEmail)) hasEmail++;
      else noEmail++;
      const key = safeStatus(booking.status) + " / " + pickupWindow(booking, dateToday);
      summary.set(key, (summary.get(key) || 0) + 1);
    }
    console.log("TOTAL FAILED CREATED EVENTS:", count);
    console.log("EVENTS REVIEWED:", reviewed);
    console.log("DISTINCT BOOKING RECORDS:", uniqueBookings.size);
    console.log("BOOKINGS NO LONGER FOUND:", bookingMissing);
    console.log("CUSTOMER EMAIL FORMAT PRESENT:", hasEmail);
    console.log("CUSTOMER EMAIL MISSING/INVALID:", noEmail);
    console.log("CURRENT BOOKING STATUS / PICKUP RELATION:");
    for (const [key, amount] of [...summary.entries()].sort()) console.log(key + ":", amount);
    if (!summary.size) console.log("NO MATCHING BOOKING DETAILS");
    if (count > reviewed) console.log("NOTICE: ONLY FIRST 100 EVENTS REVIEWED");
    console.log("POLICY: HISTORICAL EVENTS REQUIRE HUMAN REVIEW; NO AUTOMATIC RESEND");
    console.log("AUDIT: COMPLETE; NO DATABASE WRITES, QUEUE ACCESS OR EMAIL DELIVERY");
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error("AUDIT: FAIL", error?.message === "MISSING_DB" ? "DATABASE_URL_MISSING" : "DB_READ_UNAVAILABLE");
  process.exitCode = 1;
});
