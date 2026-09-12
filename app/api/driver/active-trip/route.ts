import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { prisma } from "@/lib/prisma";
import { ACTIVE_TRIP_STATUSES } from "@/lib/driver-state";
import { DRIVER_TRIP_SELECT, serializeDriverTrip } from "@/lib/driver-projections";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const activeTrip = await prisma.booking.findFirst({
    where: { driverId: auth.actor.id, status: { in: [...ACTIVE_TRIP_STATUSES] } },
    orderBy: { updatedAt: "desc" }, select: DRIVER_TRIP_SELECT,
  });
  return NextResponse.json({ success: true, activeTrip: activeTrip ? serializeDriverTrip(activeTrip) : null });
}
