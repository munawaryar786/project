import { prisma } from "@/lib/prisma";
import { bookingPickupAt } from "@/lib/scheduled-marketplace";
import { isCurrentScheduledRideJob } from "@/lib/scheduled-reminders";

/** Shared validation at both realtime delivery and persisted-notification reads. */
export function isScheduledReminderDeliveryCurrent(booking: any, payload: any, now = new Date()) {
  if (!booking || !payload || payload.bookingId !== booking.id || typeof payload.driverId !== "string" || !Number.isFinite(payload.assignedAtMs)) return false;
  const pickupAt = bookingPickupAt(booking);
  return Boolean(pickupAt && pickupAt.toISOString() === payload.pickupAt &&
    isCurrentScheduledRideJob({ booking: { ...booking, pickupAt }, job: {
      bookingId: booking.id, pickupAtMs: pickupAt.getTime(), driverId: payload.driverId, assignedAtMs: payload.assignedAtMs,
    }, nowMs: now.getTime() }));
}

export async function filterCurrentDriverReminders<T extends { type: string; data: unknown }>(notifications: T[], driverId: string) {
  const ids = [...new Set(notifications.filter((row) => row.type === "SCHEDULED_RIDE_REMINDER")
    .map((row) => (row.data as any)?.bookingId).filter((id): id is string => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)))];
  const bookings = ids.length ? await prisma.booking.findMany({
    where: { id: { in: ids }, driverId },
    select: { id: true, driverId: true, acceptedAt: true, createdAt: true, status: true, scheduledRide: true, pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true, marketTimezone: true },
  }) : [];
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  const now = new Date();
  return notifications.filter((row) => {
    if (["SCHEDULED_REMINDER_30", "SCHEDULED_WARNING_20"].includes(row.type)) return false;
    if (row.type !== "SCHEDULED_RIDE_REMINDER") return true;
    const payload = row.data as any;
    return payload?.driverId === driverId && isScheduledReminderDeliveryCurrent(byId.get(payload?.bookingId), payload, now);
  });
}
