import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPassengerFromRequest } from "@/lib/passenger-auth";
import { verifyTrackingToken } from "@/lib/tracking-token";

const RefSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,40}$/);
const TokenSchema = z.string().min(40).max(512);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const parsedRef = RefSchema.safeParse((await params).ref);
    if (!parsedRef.success) return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
    const booking = await prisma.booking.findUnique({
      where: { bookingRef: parsedRef.data },
      select: {
        id: true, passengerId: true, bookingRef: true, status: true, serviceType: true,
        pickupAddress: true, dropoffAddress: true, scheduledDate: true, scheduledTime: true,
        dispatchStatus: true, driver: {
          select: {
            fullName: true, currentLat: true, currentLng: true,
            lastLocationUpdate: true, isOnTrip: true, vehiclePlate: true, vehicleType: true,
          },
        },
      },
    });
    if (!booking) return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });

    const passenger = await getPassengerFromRequest(request);
    const tokenValue = request.nextUrl.searchParams.get("token");
    const validToken = TokenSchema.safeParse(tokenValue).success &&
      verifyTrackingToken(tokenValue!, booking.id);
    if ((!passenger || passenger.id !== booking.passengerId) && !validToken) {
      return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
    }

    const terminal = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status);
    const showDriver = ["DRIVER_ENROUTE", "IN_PROGRESS"].includes(booking.status) && booking.driver?.isOnTrip;
    return NextResponse.json({
      success: true,
      booking: {
        ref: booking.bookingRef,
        status: booking.status,
        serviceType: booking.serviceType,
        pickupAddress: terminal ? undefined : booking.pickupAddress,
        dropoffAddress: terminal ? undefined : booking.dropoffAddress,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        dispatchStatus: booking.dispatchStatus,
        progress: getStatusProgress(booking.status, booking.dispatchStatus),
      },
      driver: showDriver ? {
        name: booking.driver!.fullName,
        lat: booking.driver!.currentLat,
        lng: booking.driver!.currentLng,
        lastUpdate: booking.driver!.lastLocationUpdate,
        vehiclePlate: booking.driver!.vehiclePlate,
        vehicleType: booking.driver!.vehicleType,
      } : null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tracking status" }, { status: 500 });
  }
}

function getStatusProgress(status: string, dispatchStatus: string | null) {
  const progress: Record<string, number> = {
    PENDING: 10, CONFIRMED: 30, ASSIGNED: 50, DRIVER_ENROUTE: 60,
    IN_PROGRESS: 70, COMPLETED: 100, CANCELLED: 0,
    NOT_STARTED: 20, SEARCHING_DRIVER: 30, ACCEPTED: 50,
    EN_ROUTE: 60, ARRIVED: 70, IN_TRANSIT: 85, DISPATCH_COMPLETED: 100,
  };
  return (dispatchStatus && progress[dispatchStatus] !== undefined)
    ? progress[dispatchStatus]
    : progress[status] ?? 10;
}
