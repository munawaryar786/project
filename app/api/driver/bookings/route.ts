import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DRIVER_TRIP_SELECT, serializeDriverTrip } from "@/lib/driver-projections";
import { isTerminalTripStatus } from "@/lib/driver-state";
import { authorizeDriver } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const bookings = await prisma.booking.findMany({
      where: { driverId: auth.actor.id },
      orderBy: { scheduledDate: "asc" },
      select: { ...DRIVER_TRIP_SELECT, estimatedPrice: true, fareTotalFare: true, earning: { select: { driverAmount: true } } },
    });
    const safeBookings = bookings.map(serializeDriverTrip);
    const today = new Date().toISOString().split("T")[0];
    const active = (b: { status: string }) => !isTerminalTripStatus(b.status);
    return NextResponse.json({
      todayBookings: safeBookings.filter((b) => b.scheduledDate <= today && active(b)),
      upcomingBookings: safeBookings.filter((b) => b.scheduledDate > today && active(b)),
      completedBookings: safeBookings.filter((b) => isTerminalTripStatus(b.status)),
      totalAssigned: bookings.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
