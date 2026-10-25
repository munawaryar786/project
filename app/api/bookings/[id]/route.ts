import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { createTrackingToken } from "@/lib/tracking-token";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const booking = await prisma.booking.findFirst({
      where: { id, passengerId: auth.actor.id },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const passengerBooking: Record<string, unknown> = { ...booking };
    delete passengerBooking.passengerId;
    delete passengerBooking.driverId;
    delete passengerBooking.sourceDomain;
    delete passengerBooking.normalizedPhone;
    return NextResponse.json({ booking: passengerBooking, trackingToken: createTrackingToken(booking.id) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch booking" }, { status: 500 });
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Use an authorized booking action endpoint" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
