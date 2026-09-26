import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { bookingPickupAt } from "@/lib/scheduled-marketplace";
import { createDriverRideIcs, isDriverCalendarRideEligible } from "@/lib/driver-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid booking id", code: "INVALID_REQUEST" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const booking = await prisma.booking.findFirst({
      where: { id, driverId: auth.actor.id, scheduledRide: true },
      select: { id: true, bookingRef: true, driverId: true, scheduledRide: true, status: true, pickupAt: true, pickupDate: true, pickupTime: true, scheduledDate: true, scheduledTime: true, marketTimezone: true, pickupAddress: true, dropoffAddress: true, serviceType: true },
    });
    const pickupAt = booking ? bookingPickupAt(booking) : null;
    if (!booking || !pickupAt || !isDriverCalendarRideEligible({ ...booking, pickupAt }, auth.actor.id, new Date())) {
      return NextResponse.json({ error: "Scheduled ride not found", code: "SCHEDULED_RIDE_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const ics = createDriverRideIcs({ id: booking.id, bookingRef: booking.bookingRef, pickupAt, pickupAddress: booking.pickupAddress || "", dropoffAddress: booking.dropoffAddress || "", serviceType: booking.serviceType || "" });
    const safeRef = String(booking.bookingRef || booking.id).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || booking.id;
    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="drivo-ride-${safeRef}.ics"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("[driver.calendar.export-failed]");
    return NextResponse.json({ error: "Calendar export unavailable", code: "CALENDAR_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
