import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";

const ACTIVE_BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
];

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const driverId = auth.actor.id;

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        fullName: true,
        status: true,
        isOnline: true,
        isOnTrip: true,
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    const now = new Date();

    await prisma.rideRequest.updateMany({
      where: {
        driverId,
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: {
        status: "EXPIRED",
        respondedAt: now,
      },
    });

    const rideRequests = await prisma.rideRequest.findMany({
      where: {
        driverId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: {
        sentAt: "desc",
      },
      take: 5,
    });

    const bookingIds = rideRequests.map((request) => request.bookingId);

    const bookings = await prisma.booking.findMany({
      where: {
        id: { in: bookingIds },
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: {
        id: true,
        bookingRef: true,
        status: true,
        dispatchStatus: true,

        serviceType: true,

        pickupAddress: true,
        dropoffAddress: true,
        pickupLat: true,
        pickupLng: true,
        dropoffLat: true,
        dropoffLng: true,

        scheduledDate: true,
        scheduledTime: true,
        passengerCount: true,
        luggageType: true,
        smallBags: true,
        largeBags: true,
        wheelchairNeeded: true,
        seniorPassenger: true,
        ztpCardHolder: true,
        wheelchairUser: true,
        companionRequired: true,
        waitingTimeRequired: true,
        assistanceLevel: true,
        wheelchairType: true,
        canTransferToSeat: true,
        wavRequired: true,
        passengerRemainsInWheelchair: true,
        companionCount: true,
        tripType: true,
        returnDate: true,
        returnTime: true,
        waitingDuration: true,
        scheduledRide: true,
        recurrence: true,
        recurrenceType: true,
        pickupDate: true,
        pickupTime: true,

        waitAndGreet: true,

        languagePref: true,
        paymentMethod: true,
        cashAgreed: true,

        estimatedPrice: true,
        distanceKm: true,
        vehicleRequired: true,
      },
    });

    const requestsWithBookings = rideRequests
      .map((rideRequest) => {
        const booking = bookings.find(
          (booking) => booking.id === rideRequest.bookingId
        );

        if (!booking) return null;

        return {
          id: rideRequest.id,
          bookingId: rideRequest.bookingId,
          driverId: rideRequest.driverId,
          status: rideRequest.status,
          sentAt: rideRequest.sentAt,
          respondedAt: rideRequest.respondedAt,
          expiresAt: rideRequest.expiresAt,
          createdAt: rideRequest.createdAt,
          booking,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        status: driver.status,
        isOnline: driver.isOnline,
        isOnTrip: driver.isOnTrip,
      },
      rideRequests: requestsWithBookings,
      total: requestsWithBookings.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Driver ride requests fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ride requests" },
      { status: 500 }
    );
  }
}
