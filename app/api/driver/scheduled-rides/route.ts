import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { DRIVER_TRIP_SELECT, SCHEDULED_ELIGIBILITY_SELECT, serializeDriverTrip, serializeOfferBooking } from "@/lib/driver-projections";
import { authoritativeAssignmentEligibility } from "@/lib/booking-eligibility";
import { scheduledMarketplaceEligibility, scheduledDriverCompatibility, isFutureScheduledBooking } from "@/lib/scheduled-marketplace";
import { scanScheduledMarketplace } from "@/lib/scheduled-marketplace-list";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const now = new Date();
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  try {
    const [driver, claimed] = await Promise.all([
      prisma.driver.findUnique({ where: { id: auth.actor.id }, include: { vehicle: true } }),
      prisma.booking.findMany({ where: { driverId: auth.actor.id, OR: [{ scheduledRide: true }, { pickupAt: { gt: now } }], status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] } }, orderBy: [{ pickupAt: "asc" }, { id: "asc" }], take: 50, select: DRIVER_TRIP_SELECT }),
    ]);
    const available = driver ? await scanScheduledMarketplace({
      cursor,
      fetchPage: (after, take) => prisma.booking.findMany({
        where: { AND: [{ OR: [{ driverId: null }, { driverId: { isSet: false } }] }], status: { in: ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"] }, OR: [{ scheduledRide: true }, { pickupAt: { gt: now } }] },
        orderBy: [{ pickupAt: "asc" }, { id: "asc" }],
        ...(after ? { cursor: { id: after }, skip: 1 } : {}), take, select: SCHEDULED_ELIGIBILITY_SELECT,
      }),
      eligible: async row => scheduledMarketplaceEligibility(row, now).eligible &&
        scheduledDriverCompatibility(row, driver, now).eligible &&
        (await authoritativeAssignmentEligibility(row, prisma)).eligible,
      present: serializeOfferBooking,
    }) : { marketplace: [], nextCursor: null };
    return NextResponse.json({ success: true, marketplace: available.marketplace, nextCursor: available.nextCursor, claimedRides: claimed.filter((row) => isFutureScheduledBooking(row, now)).map(serializeDriverTrip), timestamp: now.toISOString() });
  } catch { return NextResponse.json({ error: "Failed to fetch scheduled rides", code: "SCHEDULED_RIDES_FETCH_FAILED" }, { status: 500 }); }
}
