import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { OFFER_BOOKING_SELECT, serializeOfferBooking } from "@/lib/driver-projections";
import { expireDriverOffers, getDriverPresence } from "@/lib/driver-operations";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"];


export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const driverId = auth.actor.id;
    const now = new Date();
    await expireDriverOffers(driverId, now);
    const [driver, rideRequests] = await Promise.all([
      prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, fullName: true, status: true, isOnline: true, isOnTrip: true },
      }),
      prisma.rideRequest.findMany({
        where: { driverId, status: "PENDING", expiresAt: { gt: now } },
        orderBy: { sentAt: "desc" },
        take: 10,
        select: { id: true, bookingId: true, status: true, sentAt: true, respondedAt: true, expiresAt: true, createdAt: true },
      }),
    ]);
    if (!driver) return NextResponse.json({ error: "Driver not found", code: "DRIVER_NOT_FOUND" }, { status: 404 });
    const bookings = await prisma.booking.findMany({
      where: { id: { in: rideRequests.map((request) => request.bookingId) }, status: { in: ACTIVE_BOOKING_STATUSES },
        OR: [{ driverId: null }, { driverId: { isSet: false } }] },
      select: OFFER_BOOKING_SELECT,
    });
    const byId = new Map(bookings.map((booking) => [booking.id, booking]));
    const offers = rideRequests.map((request) => {
      const booking = byId.get(request.bookingId);
      if (!booking) return null;
      return { ...request, booking: serializeOfferBooking(booking) };
    }).filter(Boolean);
    const presence = await getDriverPresence(driverId);
    return NextResponse.json({
      success: true, driver, presence: presence?.state || "OFFLINE",
      offers, rideRequests: offers, total: offers.length, timestamp: now.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch ride offers", code: "OFFERS_FETCH_FAILED" }, { status: 500 });
  }
}
