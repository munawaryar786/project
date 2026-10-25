import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { createTrackingToken } from "@/lib/tracking-token";

export async function GET(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const bookings = await prisma.booking.findMany({
    where: { passengerId: auth.actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    success: true,
    bookings: bookings.map((booking) => ({
      ...booking,
      trackingToken: createTrackingToken(booking.id),
    })),
  });
}
