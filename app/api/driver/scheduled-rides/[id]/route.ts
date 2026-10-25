import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { DRIVER_TRIP_SELECT, serializeDriverTrip } from "@/lib/driver-projections";
import { isFutureScheduledBooking } from "@/lib/scheduled-marketplace";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid booking id", code: "INVALID_REQUEST" }, { status: 400 });
  const booking = await prisma.booking.findFirst({ where: { id, driverId: auth.actor.id, OR: [{ scheduledRide: true }, { pickupAt: { gt: new Date() } }] }, select: DRIVER_TRIP_SELECT });
  if (!booking || !isFutureScheduledBooking(booking)) return NextResponse.json({ error: "Scheduled ride not found", code: "SCHEDULED_RIDE_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ success: true, booking: serializeDriverTrip(booking) });
}