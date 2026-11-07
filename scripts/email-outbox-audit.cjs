"use strict";

// Read-only release diagnostic. Reads event/delivery counts, never message
// payloads, addresses, account IDs or transport configuration values.
// It does not initialize BullMQ, send emails, replay events or mutate records.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function readEnv(snapshotDir) {
  const merged = {};
  for (const name of [".env", ".env.production", ".env.local", ".env.production.local"]) {
    const source = path.join(snapshotDir, name);
    if (fs.existsSync(source)) Object.assign(merged, dotenv.parse(fs.readFileSync(source)));
  }
  return { ...merged, ...process.env };
}

const snapshotDir = path.resolve(process.argv[2] || process.cwd());
const config = readEnv(snapshotDir);
console.log("===== DRIVO EMAIL / OUTBOX AUDIT (READ ONLY) =====");
console.log("SNAPSHOT:", "ENV FILES + CALLER ENV (not proof of running PM2 environment)");
const smtpKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const present = smtpKeys.filter(key => Boolean(config[key]));
console.log("SMTP SETTINGS:", present.length === 4 ? "COMPLETE" : present.length ? "PARTIAL" : "NOT SET");
console.log("RESEND SETTINGS:", config.RESEND_API_KEY ? "CONFIGURED" : "NOT SET");
console.log("ADMIN EMAIL:", [config.ADMIN_BOOKING_EMAIL, config.BOOKING_NOTIFICATION_EMAIL, config.ADMIN_EMAIL].some(Boolean) ? "CONFIGURED" : "NOT SET");
console.log("DATABASE URL:", config.DATABASE_URL ? "PRESENT" : "MISSING");

async function main() {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
  // Connect using the snapshot configuration, without persisting it to files
  // or printing the URI. No other service/provider client is instantiated.
  process.env.DATABASE_URL = config.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const relevant = ["BOOKING_EMAIL_CREATED", "BOOKING_EMAIL_ASSIGNED", "BOOKING_EMAIL_PAYMENT", "TRANSACTIONAL_EMAIL"];
  const pending = ["PENDING", "RETRY", "PROCESSING", "QUEUED", "FAILED"];
  try {
    const [eventGroups, deliveryGroups, olderUnfinished] = await Promise.all([
      db.outboxEvent.groupBy({
        by: ["eventType", "state"],
        where: { eventType: { in: relevant }, createdAt: { gte: start } },
        _count: { _all: true },
      }),
      db.emailDelivery.groupBy({
        by: ["kind", "status"],
        where: { createdAt: { gte: start } },
        _count: { _all: true },
      }),
      db.outboxEvent.count({
        where: { eventType: { in: relevant }, createdAt: { lt: start }, state: { in: pending } },
      }),
    ]);
    console.log("WINDOW:", "LAST 30 DAYS");
    console.log("OUTBOX BY EVENT / STATUS:");
    for (const item of eventGroups.sort((a,b) => a.eventType.localeCompare(b.eventType) || a.state.localeCompare(b.state))) {
      console.log(item.eventType, item.state, item._count._all);
    }
    if (!eventGroups.length) console.log("NO MATCHING EVENTS");
    console.log("EMAIL DELIVERIES BY TYPE / STATUS:");
    for (const item of deliveryGroups.sort((a,b) => a.kind.localeCompare(b.kind) || a.status.localeCompare(b.status))) {
      console.log(item.kind, item.status, item._count._all);
    }
    if (!deliveryGroups.length) console.log("NO MATCHING DELIVERIES");
    console.log("UNFINISHED OUTBOX EVENTS OLDER THAN 30 DAYS:", olderUnfinished);
    const toReview = eventGroups.filter(x => pending.includes(x.state))
      .reduce((n,x) => n + x._count._all, olderUnfinished);
    console.log("UNFINISHED EVENT COUNT:", toReview);
    console.log(toReview ? "RELEASE REVIEW: REQUIRED BEFORE WORKER RECOVERY" : "RELEASE REVIEW: NO UNFINISHED EMAIL OUTBOX EVENTS DETECTED");
    console.log("AUDIT: COMPLETED WITHOUT WRITES OR EMAIL SENDS");
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  // Prisma errors can include DB connection details. Deliberately suppress
  // raw exceptions, URLs, recipients and environment values in diagnostics.
  console.error("AUDIT: FAILED", error.message === "DATABASE_URL_MISSING" ? "DATABASE_URL_MISSING" : "DB_READ_UNAVAILABLE");
  process.exitCode = 1;
});
