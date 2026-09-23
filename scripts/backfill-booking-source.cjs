const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const BATCH_SIZE = 100;

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Review the configured database target, then rerun with --apply to set missing bookingSource values to WEB.");
    const sample = await prisma.booking.findMany({ where: { bookingSource: { isSet: false } }, take: BATCH_SIZE, select: { id: true } });
    console.log(`Missing bookingSource documents in first batch: ${sample.length}${sample.length === BATCH_SIZE ? " or more" : ""}`);
    return;
  }

  let updated = 0;
  for (;;) {
    const batch = await prisma.booking.findMany({ where: { bookingSource: { isSet: false } }, take: BATCH_SIZE, select: { id: true } });
    if (!batch.length) break;
    const result = await prisma.booking.updateMany({
      where: { id: { in: batch.map(({ id }) => id) }, bookingSource: { isSet: false } },
      data: { bookingSource: "WEB" },
    });
    updated += result.count;
    console.log(`Updated ${result.count} missing bookingSource values (total: ${updated}).`);
    if (result.count === 0) throw new Error("Backfill made no progress; stopping safely.");
  }
  console.log(`Backfill complete. Updated ${updated} documents.`);
}

main().catch((error) => {
  console.error("bookingSource backfill failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
