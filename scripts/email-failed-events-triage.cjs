"use strict";

/**
 * Drivo production pre-release diagnostic.
 * READ ONLY: no queue access, no event replay, no SMTP calls and no database writes.
 * Output never contains booking IDs, email addresses, event payloads, or raw DB errors.
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const envDir = path.resolve(process.argv[2] || process.cwd());
const configuration = {};
for (const filename of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  const file = path.join(envDir, filename);
  if (fs.existsSync(file)) Object.assign(configuration, dotenv.parse(fs.readFileSync(file)));
}
Object.assign(configuration, process.env);

const failedTypes = ["BOOKING_EMAIL_CREATED", "BOOKING_EMAIL_ASSIGNED", "BOOKING_EMAIL_PAYMENT", "TRANSACTIONAL_EMAIL"];
const safeStatus = (status) =>
  ["PENDING", "PROCESSING", "RETRY", "SENT", "FAILED"].includes(status) ? status : "OTHER";
function safeError(value) {
  if (typeof value !== "string") return "NONE";
  return /^(?:processing_failed|retry_limit_exceeded|queue_enqueue_failed|queued_job_missing_[a-z_]{1,70}|queued_email_sent_[a-z_]{1,70})$/.test(value)
    ? value : "REDACTED";
}
function ageBucket(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return ms < 86400000 ? "<1d" : ms < 7 * 86400000 ? "1-7d" : ms < 30 * 86400000 ? "7-30d" : "30d+";
}
async function main() {
  console.log("===== DRIVO FAILED EMAIL EVENTS: SAFE TRIAGE (READ ONLY) =====");
  if (!configuration.DATABASE_URL) throw new Error("NO_DATABASE");
  process.env.DATABASE_URL = configuration.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const count = await prisma.outboxEvent.count({ where: { state: "FAILED", eventType: { in: failedTypes } } });
    const events = await prisma.outboxEvent.findMany({
      where: { state: "FAILED", eventType: { in: failedTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        eventType: true, aggregateId: true, attempts: true, lastError: true,
        createdAt: true, payload: true, idempotencyKey: true,
      },
    });
    console.log("TOTAL FAILED EMAIL-RELATED EVENTS:", count);
    console.log("EVENTS REVIEWED:", events.length);
    if (count > events.length) console.log("NOTICE: TRUNCATED AT 100 EVENTS");

    const summary = {};
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventType = event.eventType;
      const booking = eventType === "TRANSACTIONAL_EMAIL"
        ? null
        : await prisma.booking.findUnique({
            where: { id: event.aggregateId },
            select: {
              id: true, status: true, serviceType: true, customerEmail: true,
              driverId: true, acceptedAt: true,
            },
          });
      const logicalKeys = [];
      let classification = "NO_BOOKING_LOOKUP";
      if (eventType !== "TRANSACTIONAL_EMAIL") {
        classification = booking ? "BOOKING_EXISTS" : "BOOKING_MISSING";
      }
      if (booking && eventType === "BOOKING_EMAIL_CREATED") {
        logicalKeys.push(["CUSTOMER", "BOOKING_RECEIVED:" + booking.id]);
        logicalKeys.push(["ADMIN", "ADMIN_BOOKING_CREATED:" + booking.id]);
        if (["SENIOR", "ACCESSIBLE"].includes(booking.serviceType))
          logicalKeys.push(["ASSISTED_ADMIN", "ADMIN_ASSISTED_COPY:" + booking.id]);
      }
      if (booking && eventType === "BOOKING_EMAIL_ASSIGNED") {
        const p = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload : {};
        const isCurrent = Boolean(
          booking.driverId && booking.acceptedAt &&
          booking.driverId === p.driverId &&
          booking.acceptedAt.getTime() === p.assignedAtMs &&
          !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)
        );
        classification = isCurrent ? "CURRENT_ASSIGNMENT" : "STALE_OR_CLOSED_ASSIGNMENT";
        if (isCurrent) {
          const identity = booking.id + ":" + booking.driverId + ":" + p.assignedAtMs;
          logicalKeys.push(["CUSTOMER_DRIVER", "DRIVER_CONFIRMED:" + identity]);
          logicalKeys.push(["ADMIN_DRIVER", "ADMIN_DRIVER_CONFIRMED:" + identity]);
        }
      }
      if (booking && eventType === "BOOKING_EMAIL_PAYMENT") classification = "PAYMENT_EVENT_MANUAL_REVIEW";

      const statuses = [];
      for (const [role, key] of logicalKeys) {
        const [delivery, queued] = await Promise.all([
          prisma.emailDelivery.findUnique({ where: { logicalKey: key }, select: { status: true } }),
          prisma.outboxEvent.findUnique({ where: { idempotencyKey: "email:" + key }, select: { state: true } }),
        ]);
        statuses.push(role + ":delivery=" + (delivery ? safeStatus(delivery.status) : "NONE") +
          "/outbox=" + (queued ? safeStatus(queued.state) : "NONE"));
      }
      if (eventType === "TRANSACTIONAL_EMAIL") {
        const p = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? event.payload : {};
        classification = typeof p.type === "string" && /^[A-Z_]{3,40}$/.test(p.type)
          ? "TRANSACTIONAL_" + p.type : "TRANSACTIONAL_UNKNOWN";
        const delivery = typeof p.idempotencyKey === "string"
          ? await prisma.emailDelivery.findUnique({ where: { logicalKey: p.idempotencyKey }, select: { status: true } }) : null;
        statuses.push("DELIVERY:" + (delivery ? safeStatus(delivery.status) : "NONE"));
      }
      const key = eventType + "/" + classification + "/" + safeError(event.lastError);
      summary[key] = (summary[key] || 0) + 1;
      console.log(
        "EVENT " + (i + 1) + ":",
        eventType,
        "attempts=" + event.attempts,
        "age=" + ageBucket(event.createdAt),
        "error=" + safeError(event.lastError),
        "category=" + classification,
        statuses.join(" ") || "no-recipient-delivery-match"
      );
    }
    console.log("SAFE FAILURE SUMMARY:");
    for (const [key, count] of Object.entries(summary).sort()) console.log(key, count);
    console.log("AUDIT: COMPLETE - NO EMAILS SENT, NO QUEUE OR DATABASE WRITES");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("AUDIT: FAILED", error?.message === "NO_DATABASE" ? "DATABASE_URL_MISSING" : "DB_READ_UNAVAILABLE");
  process.exitCode = 1;
});
