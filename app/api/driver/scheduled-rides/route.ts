import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { DRIVER_TRIP_SELECT, OFFER_BOOKING_SELECT, serializeDriverTrip, serializeOfferBooking } from "@/lib/driver-projections";
import { scheduledMarketplaceEligibility, scheduledDriverCompatibility, isFutureScheduledBooking } from "@/lib/scheduled-marketplace";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const now = new Date();
  try {
    const [driver, rows, claimed] = await Promise.all([
      prisma.driver.findUnique({ where: { id: auth.actor.id }, include: { vehicle: true } }),
      prisma.booking.findMany({ where: { driverId: null, status: { in: ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"] }, OR: [{ scheduledRide: true }, { pickupAt: { gt: now } }] }, orderBy: [{ pickupAt: "asc" }, { id: "asc" }], take: 100, select: OFFER_BOOKING_SELECT }),
      prisma.booking.findMany({ where: { driverId: auth.actor.id, OR: [{ scheduledRide: true }, { pickupAt: { gt: now } }], status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] } }, orderBy: [{ pickupAt: "asc" }, { id: "asc" }], take: 50, select: DRIVER_TRIP_SELECT }),
    ]);
    const marketplace = driver ? rows.filter((row) => scheduledMarketplaceEligibility(row, now).eligible && scheduledDriverCompatibility(row, driver, now).eligible).map(serializeOfferBooking) : [];
    return NextResponse.json({ success: true, marketplace, claimedRides: claimed.filter((row) => isFutureScheduledBooking(row, now)).map(serializeDriverTrip), timestamp: now.toISOString() });
  } catch { return NextResponse.json({ error: "Failed to fetch scheduled rides", code: "SCHEDULED_RIDES_FETCH_FAILED" }, { status: 500 }); }
}
