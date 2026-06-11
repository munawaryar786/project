import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPassengerFromRequest } from "@/lib/passenger-auth";

export async function GET(request: NextRequest) {
  const passenger = await getPassengerFromRequest(request);

  if (!passenger) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const bookings = await prisma.booking.findMany({
    where: { passengerId: passenger.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, bookings });
}
