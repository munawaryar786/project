import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { emitScheduledEvent, runScheduledReadinessCheck, scheduleScheduledRideJobs, bookingPickupAt, isScheduledBooking } from "@/lib/scheduled-marketplace";

export type ScheduledRideJob = { bookingId: string; pickupAtMs: number; kind: "T30" | "T20" | "T15" };

export async function processScheduledRideJob(job: Job<ScheduledRideJob>) {
  const { bookingId, pickupAtMs, kind } = job.data;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, driverId: true, status: true, scheduledRide: true, pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true, marketTimezone: true } });
  if (!booking || !booking.driverId || !isScheduledBooking(booking) || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return { outcome: "NOOP" };
  const pickupAt = bookingPickupAt(booking);
  if (!pickupAt || pickupAt.getTime() !== pickupAtMs) return { outcome: "STALE" };
  if (kind === "T15") return runScheduledReadinessCheck(bookingId, pickupAtMs);
  await emitScheduledEvent({ bookingId, driverId: booking.driverId, eventType: kind === "T30" ? "SCHEDULED_REMINDER_30" : "SCHEDULED_WARNING_20", kind: kind === "T30" ? "SCHEDULED_REMINDER_30" : "SCHEDULED_WARNING_20", pickupAt });
  return { outcome: "NOTIFIED" };
}

export async function reconcileScheduledRideJobs(now = new Date()) {
  const horizon = new Date(now.getTime() + 31 * 60 * 1000);
  const rows = await prisma.booking.findMany({ where: { OR: [{ scheduledRide: true }, { pickupAt: { gt: now } }], driverId: { not: null }, pickupAt: { gt: now, lte: horizon }, status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] } }, select: { id: true }, take: 100 });
  for (const row of rows) await scheduleScheduledRideJobs(row.id);
  return rows.length;
}
